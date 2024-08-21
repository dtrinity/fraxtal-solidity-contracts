import hre from "hardhat";

import { POOL_ADDRESSES_PROVIDER_ID } from "./deploy-ids";

/**
 * Get the Lending pool contract's address
 * - The contract name is `Pool`
 *
 * @returns - The Lending pool contract's address
 */
export async function getPoolContractAddress(): Promise<string> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(lendingDeployer);

  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    signer,
  );

  return await addressProviderContract.getPool();
}

/**
 * Get the list of registered reserve tokens on the Lending pool
 *
 * @returns - The list of registered reserve tokens on the Lending pool
 */
export async function getReservesList(): Promise<string[]> {
  const poolAddress = await getPoolContractAddress();
  const poolContract = await hre.ethers.getContractAt("Pool", poolAddress);

  return await poolContract.getReservesList();
}
