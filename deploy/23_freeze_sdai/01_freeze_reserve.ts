import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { SafeTransactionData } from "../../typescript/safe/types";
import {
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_CONFIGURATOR_PROXY_ID,
} from "../../utils/lending/deploy-ids";

/**
 * Build a Safe transaction payload to freeze a reserve on the PoolConfigurator.
 *
 * @param configuratorAddress - Address of the PoolConfigurator contract
 * @param asset - Address of the asset to freeze
 * @param freeze - True to freeze the reserve, false to unfreeze
 * @param configuratorInterface - Contract interface used to encode the call
 */
function createSetReserveFreezeTransaction(
  configuratorAddress: string,
  asset: string,
  freeze: boolean,
  configuratorInterface: any,
): SafeTransactionData {
  return {
    to: configuratorAddress,
    value: "0",
    data: configuratorInterface.encodeFunctionData("setReserveFreeze", [
      asset,
      freeze,
    ]),
  };
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;
  const { lendingDeployer } = await hre.getNamedAccounts();
  console.log(`🔐 Deployer: ${lendingDeployer}`);
  const deployerSigner = await ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);

  // Initialize governance executor (decides Safe vs direct execution)
  const executor = new GovernanceExecutor(
    hre,
    deployerSigner,
    config.safeConfig,
  );
  await executor.initialize();

  console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: executing...`);

  const governanceMultisig = config.walletAddresses.governanceMultisig;
  console.log(`🔐 Governance multisig: ${governanceMultisig}`);

  // sDAI address from config
  const sDAIAddress = config.lending.reserveAssetAddresses?.sDAI;

  if (!sDAIAddress) {
    console.error("sDAI address not found in config");
    console.log(
      `\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅ (token not found)`,
    );
    return true;
  }

  console.log(`🪙 sDAI address: ${sDAIAddress}`);

  // Get PoolConfigurator deployment
  console.log(`\n🔧 Getting PoolConfigurator deployment...`);
  const poolAddressesProviderDeployment = await deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const poolAddressesProvider = await ethers.getContractAt(
    "PoolAddressesProvider",
    poolAddressesProviderDeployment.address,
  );

  // Get the REGISTERED PoolConfigurator, not the deployed one
  const registeredPoolConfiguratorAddress =
    await poolAddressesProvider.getPoolConfigurator();
  const poolConfigurator = await ethers.getContractAt(
    "PoolConfigurator",
    registeredPoolConfiguratorAddress,
  );

  console.log(
    `✅ PoolConfigurator found at: ${registeredPoolConfiguratorAddress}`,
  );

  // Get Pool contract through PoolAddressesProvider
  console.log(`\n🔍 Getting Pool contract...`);
  const poolAddress = await poolAddressesProvider.getPool();
  const pool = await ethers.getContractAt("Pool", poolAddress);

  console.log(`✅ Pool found at: ${poolAddress}`);

  // Check current freeze state
  console.log(`\n🔍 Checking current reserve state...`);
  const reserveConfig = await pool.getConfiguration(sDAIAddress);

  // Use ReserveConfiguration library to decode frozen state
  // We'll check the frozen bit directly from the configuration data
  const FROZEN_START_BIT_POSITION = 57n; // From ReserveConfiguration.sol
  const currentlyFrozen =
    ((reserveConfig.data >> FROZEN_START_BIT_POSITION) & 1n) === 1n;

  console.log(
    `📊 Current freeze state: ${currentlyFrozen ? "FROZEN" : "ACTIVE"}`,
  );

  if (currentlyFrozen) {
    console.log(`ℹ️  Reserve is already frozen. Nothing to do.`);
    console.log(
      `\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅ (already frozen)`,
    );
    return true;
  }

  // Freeze the reserve
  console.log(`\n❄️  Freezing sDAI reserve...`);

  let operationComplete = false;

  try {
    operationComplete = await executor.tryOrQueue(
      async () => {
        await poolConfigurator.setReserveFreeze(sDAIAddress, true);
        console.log(`    ✅ sDAI reserve frozen successfully`);
      },
      () =>
        createSetReserveFreezeTransaction(
          registeredPoolConfiguratorAddress,
          sDAIAddress,
          true,
          poolConfigurator.interface,
        ),
    );
  } catch (error) {
    console.error(`    ❌ Failed to freeze reserve:`, error);
    throw error;
  }

  // Handle governance operations if needed
  if (!operationComplete) {
    const flushed = await executor.flush(
      `Freeze sDAI reserve: governance operations`,
    );

    if (executor.useSafe) {
      if (!flushed) {
        console.log(`❌ Failed to prepare governance batch`);
      }
      console.log(
        "\n⏳ Freeze operation requires governance signatures to complete.",
      );
      console.log(
        "   The deployment script will exit and can be re-run after governance executes the transactions.",
      );
      console.log(
        `\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`,
      );
      return false; // Fail idempotently - script can be re-run
    } else {
      console.log(
        "\n⏭️ Non-Safe mode: pending governance operations detected; continuing.",
      );
    }
  }

  // Verify the freeze was successful (if executed directly)
  if (operationComplete) {
    console.log(`\n✅ Verifying freeze operation...`);
    const updatedReserveConfig = await pool.getConfiguration(sDAIAddress);
    const nowFrozen =
      ((updatedReserveConfig.data >> FROZEN_START_BIT_POSITION) & 1n) === 1n;

    if (nowFrozen) {
      console.log(`    ✅ sDAI reserve is now FROZEN`);
      console.log(`    ℹ️  Users can no longer supply to this reserve`);
      console.log(`    ℹ️  Users can still withdraw from this reserve`);
    } else {
      console.log(`    ❌ Reserve freeze verification failed`);
      throw new Error("Reserve freeze verification failed");
    }
  }

  console.log("\n✅ All operations completed successfully.");
  console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅`);
  return true;
};

func.id = "freeze-sdai-reserve";
func.tags = ["dlend", "reserve-management", "freeze", "sdai"];
func.dependencies = [POOL_CONFIGURATOR_PROXY_ID, POOL_ADDRESSES_PROVIDER_ID];

export default func;
