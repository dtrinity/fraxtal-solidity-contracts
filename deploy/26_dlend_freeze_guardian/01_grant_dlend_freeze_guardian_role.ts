import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { DLEND_FREEZE_GUARDIAN_ID, POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);

  const guardianDeployment = await hre.deployments.get(DLEND_FREEZE_GUARDIAN_ID);
  const addressesProviderDeployment = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressesProvider = await hre.ethers.getContractAt("PoolAddressesProvider", addressesProviderDeployment.address, deployer);
  const aclManagerAddress = await addressesProvider.getACLManager();
  const aclManager = await hre.ethers.getContractAt("ACLManager", aclManagerAddress, deployer);
  const guardianAddress = guardianDeployment.address;

  const hasRiskAdmin = await aclManager.isRiskAdmin(guardianAddress);
  const hasPoolAdmin = await aclManager.isPoolAdmin(guardianAddress);
  const hasEmergencyAdmin = await aclManager.isEmergencyAdmin(guardianAddress);

  if (hasPoolAdmin) {
    throw new Error(`DlendFreezeGuardian unexpectedly has POOL_ADMIN_ROLE: ${guardianAddress}`);
  }

  if (hasEmergencyAdmin) {
    throw new Error(`DlendFreezeGuardian unexpectedly has EMERGENCY_ADMIN_ROLE: ${guardianAddress}`);
  }

  if (hasRiskAdmin) {
    console.log(`DlendFreezeGuardian already has RISK_ADMIN on ${aclManagerAddress}.`);
    return true;
  }

  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const grantRiskAdminTx = (): SafeTransactionData => ({
    to: aclManagerAddress,
    value: "0",
    data: aclManager.interface.encodeFunctionData("addRiskAdmin", [guardianAddress]),
  });

  const complete = await executor.tryOrQueue(async () => {
    await (await aclManager.addRiskAdmin(guardianAddress)).wait();
    console.log(`  Granted RISK_ADMIN to DlendFreezeGuardian ${guardianAddress}`);
  }, grantRiskAdminTx);

  if (!complete) {
    await executor.flush("DLend freeze guardian: grant RISK_ADMIN_ROLE");
    console.log("\nDlendFreezeGuardian RISK_ADMIN grant queued for governance signatures.");
    console.log("Re-run the script after the Safe batch is executed to finalize.");
    return false;
  }

  const hasRiskAdminAfter = await aclManager.isRiskAdmin(guardianAddress);
  const hasPoolAdminAfter = await aclManager.isPoolAdmin(guardianAddress);
  const hasEmergencyAdminAfter = await aclManager.isEmergencyAdmin(guardianAddress);

  if (!hasRiskAdminAfter) {
    throw new Error(`DlendFreezeGuardian RISK_ADMIN grant did not take effect: ${guardianAddress}`);
  }

  if (hasPoolAdminAfter || hasEmergencyAdminAfter) {
    throw new Error(`DlendFreezeGuardian role separation violated: ${guardianAddress}`);
  }

  return true;
};

func.id = "DlendFreezeGuardian:grant-risk-admin";
func.tags = ["dlend", "dlend-freeze-guardian", "dlend-freeze-guardian-roles"];
func.dependencies = ["lbp-provider", "lbp-acl", "dlend-freeze-guardian-deploy"];

export default func;
