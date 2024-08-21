import hre from "hardhat";

import { POOL_DATA_PROVIDER_ID } from "./deploy-ids";

/**
 * Get the reserve configuration data
 *
 * @param borrowTokenAddress - The address of the token to be borrowed
 * @returns - The reserve configuration data
 */
export async function getReserveConfigurationData(
  borrowTokenAddress: string,
): Promise<{
  decimals: bigint;
  ltv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint; // 10500 means 105%
  reserveFactor: bigint;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
  stableBorrowRateEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
}> {
  const dataProviderDeployment = await hre.deployments.get(
    POOL_DATA_PROVIDER_ID,
  );
  const dataProviderContract = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    dataProviderDeployment.address,
  );

  const {
    decimals,
    ltv,
    liquidationThreshold,
    liquidationBonus,
    reserveFactor,
    usageAsCollateralEnabled,
    borrowingEnabled,
    stableBorrowRateEnabled,
    isActive,
    isFrozen,
  } =
    await dataProviderContract.getReserveConfigurationData(borrowTokenAddress);

  return {
    decimals,
    ltv,
    liquidationThreshold,
    liquidationBonus,
    reserveFactor,
    usageAsCollateralEnabled,
    borrowingEnabled,
    stableBorrowRateEnabled,
    isActive,
    isFrozen,
  };
}
