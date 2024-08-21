import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";

const REGISTRY_CONTRACT_NAME = "PoolAddressesProviderRegistry";

/**
 * Deploy the PoolAddressesProviderRegistry contract and transfer ownership to the addressesProviderRegistryOwner
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/00_core/01_logic_libraries.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param addressesProviderRegistryOwner - The owner of the PoolAddressesProviderRegistry contract
 * @returns True if the deployment is successful
 */
export async function deployPoolAddressesProviderRegistry(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  addressesProviderRegistryOwner: HardhatEthersSigner,
): Promise<boolean> {
  const poolAddressesProviderRegistryDeployedResult = await deployContract(
    hre,
    REGISTRY_CONTRACT_NAME,
    [deployer.address],
    undefined, // auto-filled gas limit
    deployer,
  );

  const registryInstance = await hre.ethers.getContractAt(
    REGISTRY_CONTRACT_NAME,
    poolAddressesProviderRegistryDeployedResult.address,
    deployer,
  );

  console.log(`------------------------`);
  console.log(
    `Transfer ownership of ${REGISTRY_CONTRACT_NAME} to ${addressesProviderRegistryOwner.address}`,
  );
  const response = await registryInstance.transferOwnership(
    addressesProviderRegistryOwner,
  );
  const receipt = await response.wait();
  console.log(`  - TxHash: ${receipt?.hash}`);
  console.log(`  - From: ${receipt?.from}`);
  console.log(`  - GasUsed: ${receipt?.gasUsed.toString()}`);
  console.log(`------------------------`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
