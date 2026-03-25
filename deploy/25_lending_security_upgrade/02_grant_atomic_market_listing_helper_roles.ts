import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { ATOMIC_MARKET_LISTING_HELPER_ID } from "../../utils/lending/security-upgrade-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);

  const helperDeployment = await hre.deployments.get(ATOMIC_MARKET_LISTING_HELPER_ID);
  const addressesProviderDeployment = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const addressesProvider = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProviderDeployment.address,
    deployer,
  );
  const aclManagerAddress = await addressesProvider.getACLManager();
  const aclManager = await hre.ethers.getContractAt(
    "ACLManager",
    aclManagerAddress,
    deployer,
  );

  const helperAddress = helperDeployment.address;
  const hasAssetListingAdmin = await aclManager.isAssetListingAdmin(helperAddress);
  const hasRiskAdmin = await aclManager.isRiskAdmin(helperAddress);

  if (hasAssetListingAdmin && hasRiskAdmin) {
    console.log(
      `AtomicMarketListingHelper already has ASSET_LISTING_ADMIN and RISK_ADMIN on ${aclManagerAddress}.`,
    );
    return true;
  }

  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  let pendingGovernance = false;

  const queueTx = (fn: "addAssetListingAdmin" | "addRiskAdmin"): SafeTransactionData => ({
    to: aclManagerAddress,
    value: "0",
    data: aclManager.interface.encodeFunctionData(fn, [helperAddress]),
  });

  if (!hasAssetListingAdmin) {
    const complete = await executor.tryOrQueue(
      async () => {
        await (await aclManager.addAssetListingAdmin(helperAddress)).wait();
        console.log(`  ➕ Granted ASSET_LISTING_ADMIN to ${helperAddress}`);
      },
      () => queueTx("addAssetListingAdmin"),
    );
    pendingGovernance = pendingGovernance || !complete;
  }

  if (!hasRiskAdmin) {
    const complete = await executor.tryOrQueue(
      async () => {
        await (await aclManager.addRiskAdmin(helperAddress)).wait();
        console.log(`  ➕ Granted RISK_ADMIN to ${helperAddress}`);
      },
      () => queueTx("addRiskAdmin"),
    );
    pendingGovernance = pendingGovernance || !complete;
  }

  if (pendingGovernance) {
    await executor.flush(
      "Fraxtal lending security upgrade: grant AtomicMarketListingHelper ACL roles",
    );
    console.log("\n⏳ AtomicMarketListingHelper role grants queued for governance signatures.");
    console.log("   Re-run the script after the Safe batch is executed to finalize.");
    return false;
  }

  return true;
};

func.id = "FraxtalLendingSecurityUpgrade:AtomicMarketListingHelperRoles";
func.tags = ["lbp", "lbp-security-upgrade", "lbp-market-listing-helper-roles"];
func.dependencies = ["lbp-market", ATOMIC_MARKET_LISTING_HELPER_ID];

export default func;
