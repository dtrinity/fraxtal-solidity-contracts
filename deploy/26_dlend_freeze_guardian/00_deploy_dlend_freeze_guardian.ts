import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { DLEND_FREEZE_GUARDIAN_ID, POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";

const DLEND_FREEZE_GUARDIAN_OWNER = "0xA9c3cF89D9B7680cC2433E2A2bf8E2b357a03d65";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const addressesProviderDeployment = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  const deployment = await hre.deployments.deploy(DLEND_FREEZE_GUARDIAN_ID, {
    from: deployer.address,
    contract: "DlendFreezeGuardian",
    args: [addressesProviderDeployment.address, DLEND_FREEZE_GUARDIAN_OWNER],
    autoMine: true,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const guardian = await hre.ethers.getContractAt("DlendFreezeGuardian", deployment.address, deployer);
  const owner = await guardian.owner();
  const addressesProvider = await guardian.ADDRESSES_PROVIDER();

  if (owner.toLowerCase() !== DLEND_FREEZE_GUARDIAN_OWNER.toLowerCase()) {
    throw new Error(`DlendFreezeGuardian owner mismatch: expected ${DLEND_FREEZE_GUARDIAN_OWNER}, got ${owner}`);
  }

  if (addressesProvider.toLowerCase() !== addressesProviderDeployment.address.toLowerCase()) {
    throw new Error(`DlendFreezeGuardian provider mismatch: expected ${addressesProviderDeployment.address}, got ${addressesProvider}`);
  }

  return true;
};

func.id = "DlendFreezeGuardian:deploy";
func.tags = ["dlend", "dlend-freeze-guardian", "dlend-freeze-guardian-deploy"];
func.dependencies = ["lbp-provider"];

export default func;
