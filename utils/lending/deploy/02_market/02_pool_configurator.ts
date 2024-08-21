import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import {
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_CONFIGURATOR_IMPL_ID,
  RESERVES_SETUP_HELPER_ID,
} from "../../../../utils/lending/deploy-ids";

/**
 * Deploy the pool configurator implementation contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/02_pool_configurator.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployPoolConfigurator(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const { address: addressesProviderAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const configuratorLogicDeployedResult =
    await hre.deployments.get("ConfiguratorLogic");

  const poolConfigDeployedResult = await deployContract(
    hre,
    POOL_CONFIGURATOR_IMPL_ID,
    [],
    undefined, // auto-filled gas limit
    deployer,
    {
      ConfiguratorLogic: configuratorLogicDeployedResult.address,
    },
    "PoolConfigurator", // The actual contract name
  );

  console.log(`------------------------`);
  console.log(`Initialize pool configurator implementation`);
  console.log(
    `  - Pool configurator implementation: ${poolConfigDeployedResult.address}`,
  );
  console.log(
    `  - Address Provider                : ${addressesProviderAddress}`,
  );

  // Initialize implementation
  const poolConfig = await hre.ethers.getContractAt(
    "PoolConfigurator",
    poolConfigDeployedResult.address,
    // deployer,
  );
  const initPoolConfigResponse = await poolConfig.initialize(
    addressesProviderAddress,
  );
  const initPoolConfigReceipt = await initPoolConfigResponse.wait();
  console.log(`  - TxHash  : ${initPoolConfigReceipt?.hash}`);
  console.log(`  - From    : ${initPoolConfigReceipt?.from}`);
  console.log(`  - GasUsed : ${initPoolConfigReceipt?.gasUsed.toString()}`);
  console.log(`------------------------`);

  await deployContract(
    hre,
    RESERVES_SETUP_HELPER_ID,
    [],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "ReservesSetupHelper", // The actual contract name
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
