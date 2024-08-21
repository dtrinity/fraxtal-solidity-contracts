import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../deploy";
import { L2_POOL_IMPL_ID, POOL_ADDRESSES_PROVIDER_ID } from "../../deploy-ids";
import { getPoolLibraries } from "../../utils";

/**
 * Deploy the L2 pool implementation contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/01b_l2_pool_implementation.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployL2PoolImplementation(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const { address: addressesProviderAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const commonLibraries = await getPoolLibraries(hre);

  // Deploy L2 libraries
  const calldataLogicLibrary = await deployContract(
    hre,
    "CalldataLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  // Deploy L2 supported Pool
  const poolDeployedResult = await deployContract(
    hre,
    L2_POOL_IMPL_ID,
    [addressesProviderAddress],
    undefined, // auto-filled gas limit
    deployer,
    {
      ...commonLibraries,
      CalldataLogic: calldataLogicLibrary.address.toString(),
    },
    "L2Pool", // The actual contract name
  );

  console.log(`------------------------`);
  console.log(`Initialize L2 pool implementation`);
  console.log(`  - Pool implementation: ${poolDeployedResult.address}`);
  console.log(`  - Address Provider   : ${addressesProviderAddress}`);

  // Initialize implementation
  const poolContract = await hre.ethers.getContractAt(
    "Pool",
    poolDeployedResult.address,
    // deployer,
  );
  const initPoolResponse = await poolContract.initialize(
    addressesProviderAddress,
  );
  const initPoolReceipt = await initPoolResponse.wait();
  console.log(`  - TxHash  : ${initPoolReceipt?.hash}`);
  console.log(`  - From    : ${initPoolReceipt?.from}`);
  console.log(`  - GasUsed : ${initPoolReceipt?.gasUsed.toString()}`);
  console.log(`------------------------`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
