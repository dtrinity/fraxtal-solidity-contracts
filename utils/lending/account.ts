import hre from "hardhat";

import { batchProcessing } from "../utils";
import { POOL_DATA_PROVIDER_ID } from "./deploy-ids";
import { getPoolContractAddress, getReservesList } from "./pool";

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

/**
 * Get the user reserve data on the Lending Pool for a specific asset
 *
 * @param assetAddress - The address of the asset
 * @param userAddress - The address of the user
 * @returns - The user reserve data on the Lending Pool for a specific asset
 */
export async function getUserReserveData(
  assetAddress: string,
  userAddress: string,
): Promise<{
  currentATokenBalance: bigint;
  currentStableDebt: bigint;
  currentVariableDebt: bigint;
  principalStableDebt: bigint;
  scaledVariableDebt: bigint;
  stableBorrowRate: bigint;
  liquidityRate: bigint;
  stableRateLastUpdated: bigint;
  usageAsCollateralEnabled: boolean;
}> {
  const { address: poolDataProviderAddress } = await hre.deployments.get(
    POOL_DATA_PROVIDER_ID,
  );
  const poolDataProviderContract = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    poolDataProviderAddress,
  );
  return await poolDataProviderContract.getUserReserveData(
    assetAddress,
    userAddress,
  );
}

/**
 * Get the reserve assets collateral and debt balances for multiple users
 *
 * @param userAddresses - Array of user addresses to get data for
 * @param batchSize - Batch size for processing users
 * @param showProgress - Whether to show progress
 * @returns - Object mapping user and asset addresses to collateral and debt balances
 */
export async function getUsersReserveBalances(
  userAddresses: string[],
  batchSize: number,
  showProgress: boolean = false,
): Promise<{
  [userAddress: string]: {
    [assetAddress: string]: {
      collateral: bigint;
      debt: bigint;
    };
  };
}> {
  const result: {
    [userAddress: string]: {
      [assetAddress: string]: {
        collateral: bigint;
        debt: bigint;
      };
    };
  } = {};

  const reservesList = await getReservesList();

  // Process users in batches
  await batchProcessing(
    userAddresses,
    batchSize,
    async (userAddress) => {
      result[userAddress] = {};

      // Process reserves one by one for each user
      for (const assetAddress of reservesList) {
        const reserveData = await getUserReserveData(assetAddress, userAddress);
        const totalDebt =
          reserveData.currentStableDebt + reserveData.currentVariableDebt;
        result[userAddress][assetAddress] = {
          collateral: reserveData.currentATokenBalance,
          debt: totalDebt,
        };
      }
    },
    showProgress,
  );

  return result;
}
