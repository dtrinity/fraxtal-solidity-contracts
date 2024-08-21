import hre from "hardhat";

import { getPoolContractAddress } from "./pool";

/**
 * Get the user account data on the Lending Pool
 *
 * @param userAddress - The address of the user
 * @returns - User account data on the Lending Pool
 */
export async function getUserAccountData(userAddress: string): Promise<{
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
}> {
  const poolContractAddress = await getPoolContractAddress();
  const poolContract = await hre.ethers.getContractAt(
    "Pool",
    poolContractAddress,
  );
  return await poolContract.getUserAccountData(userAddress);
}

/**
 * Get the scaled health factor of the user on the Lending Pool
 *
 * @param userAddress - The address of the user
 * @returns - The scaled health factor of the user on the Lending Pool
 */
export async function getUserHealthFactor(
  userAddress: string,
): Promise<number> {
  const { healthFactor } = await getUserAccountData(userAddress);
  return Number(healthFactor) / 1e18;
}
