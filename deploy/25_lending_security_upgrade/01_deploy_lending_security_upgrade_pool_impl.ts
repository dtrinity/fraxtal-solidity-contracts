import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { SECURITY_UPGRADE_FLASH_LOAN_LOGIC_ID, SECURITY_UPGRADE_L2_POOL_IMPL_ID } from "../../utils/lending/security-upgrade-ids";
import { getPoolLibraries } from "../../utils/lending/utils";

const IMPLEMENTATION_SLOT = "0x360894A13BA1A3210667C828492DB98DCA3E2076CC3735A920A3CA505D382BBC";
const SECURITY_UPGRADE_POOL_REVISION = 0x2n;

/**
 * Converts a 32-byte storage slot value to an address.
 *
 * @param storageValue The 32-byte hex string from eth_getStorageAt
 * @returns The extracted address
 */
function storageToAddress(storageValue: string): string {
  return `0x${storageValue.slice(-40)}`;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);

  const addressesProviderDeployment = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressesProvider = await hre.ethers.getContractAt("PoolAddressesProvider", addressesProviderDeployment.address, deployer);

  const poolProxyAddress = await addressesProvider.getPool();
  const poolProxy = await hre.ethers.getContractAt("Pool", poolProxyAddress, deployer);
  const currentRevision = await poolProxy.POOL_REVISION();

  if (currentRevision >= SECURITY_UPGRADE_POOL_REVISION) {
    console.log(
      `Fraxtal lending security upgrade: pool already reports revision ${currentRevision.toString()}, skipping implementation upgrade.`,
    );
    return true;
  }

  const borrowLogic = await hre.deployments.get("BorrowLogic");
  const commonLibraries = await getPoolLibraries(hre);
  const calldataLogic = await hre.deployments.get("CalldataLogic");

  const flashLoanLogicDeployment = await hre.deployments.deploy(SECURITY_UPGRADE_FLASH_LOAN_LOGIC_ID, {
    from: deployer.address,
    contract: "FlashLoanLogic",
    args: [],
    libraries: {
      BorrowLogic: borrowLogic.address,
    },
    autoMine: true,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const poolImplementationDeployment = await hre.deployments.deploy(SECURITY_UPGRADE_L2_POOL_IMPL_ID, {
    from: deployer.address,
    contract: "L2Pool",
    args: [addressesProviderDeployment.address],
    libraries: {
      ...commonLibraries,
      FlashLoanLogic: flashLoanLogicDeployment.address,
      CalldataLogic: calldataLogic.address,
    },
    autoMine: true,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const poolImplementation = await hre.ethers.getContractAt("L2Pool", poolImplementationDeployment.address, deployer);

  if (poolImplementationDeployment.newlyDeployed) {
    const initTx = await poolImplementation.initialize(addressesProviderDeployment.address);
    await initTx.wait();
  }

  const currentImplementationStorage = await hre.ethers.provider.send("eth_getStorageAt", [
    poolProxyAddress,
    IMPLEMENTATION_SLOT,
    "latest",
  ]);
  const currentImplementationAddress = storageToAddress(currentImplementationStorage).toLowerCase();

  if (currentImplementationAddress === poolImplementationDeployment.address.toLowerCase()) {
    console.log(`Fraxtal lending security upgrade: proxy already points to ${poolImplementationDeployment.address}.`);
    return true;
  }

  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const didExecuteOrQueue = await executor.tryOrQueue(
    async () => {
      const tx = await addressesProvider.setPoolImpl(poolImplementationDeployment.address);
      await tx.wait();
    },
    () => ({
      to: addressesProviderDeployment.address,
      value: "0",
      data: addressesProvider.interface.encodeFunctionData("setPoolImpl", [poolImplementationDeployment.address]),
    }),
  );

  await executor.flush("Fraxtal lending security upgrade: set patched L2Pool implementation");

  if (didExecuteOrQueue && executor.queuedTransactions.length === 0) {
    const postRevision = await poolProxy.POOL_REVISION();

    if (postRevision < SECURITY_UPGRADE_POOL_REVISION) {
      throw new Error(
        `Expected pool revision ${SECURITY_UPGRADE_POOL_REVISION.toString()} after direct upgrade, got ${postRevision.toString()}`,
      );
    }
    return true;
  }

  console.log("\n⏳ Pool implementation upgrade queued for governance signatures.");
  console.log("   Re-run the script after the Safe batch is executed to finalize.");
  return false;
};

func.id = "FraxtalLendingSecurityUpgrade:PoolImplementation";
func.tags = ["lbp", "lbp-security-upgrade", "lbp-pool-security-upgrade"];
func.dependencies = ["lbp-market"];

export default func;
