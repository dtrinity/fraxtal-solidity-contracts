import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import hre from "hardhat";

import { getOraclePrice } from "../../dex/oracle";
import { getUserHealthFactor } from "../../lending/account";
import {
  getUserDebtBalance,
  getUserSupplyBalance,
} from "../../lending/balance";
import { getReserveConfigurationData } from "../../lending/reserve";
import { getCloseFactorHFThreshold } from "../../lending/utils";
import PercentMath, { pow10 } from "../../maths/PercentMath";
import { TokenInfo } from "../../token";

export * from "./utils.run";

/**
 * Get the liquidation profit in USD
 *
 * @param borrowTokenInfo - The borrow token info
 * @param borrowTokenPriceInUSD - The borrow token price in USD
 * @param borrowTokenPriceInUSD.rawValue - The borrow token price in USD
 * @param borrowTokenPriceInUSD.decimals - The borrow token price decimals
 * @param liquidateRawAmount - The liquidate raw amount
 * @returns The liquidation profit in USD
 */
export async function getLiquidationProfitInUSD(
  borrowTokenInfo: TokenInfo,
  borrowTokenPriceInUSD: {
    rawValue: BigNumber;
    decimals: number;
  },
  liquidateRawAmount: bigint,
): Promise<number> {
  const { liquidationBonus } = await getReserveConfigurationData(
    borrowTokenInfo.address,
  );

  const liquidateAmountInUSD =
    borrowTokenPriceInUSD.rawValue.mul(liquidateRawAmount);

  let res = PercentMath.percentMul(
    liquidateAmountInUSD,
    BigNumber.from(liquidationBonus).sub(PercentMath.BASE_PERCENT),
  );
  res = res.div(pow10(borrowTokenInfo.decimals));

  return res.toNumber() / 10 ** borrowTokenPriceInUSD.decimals;
}

/**
 * Calculate the maximum liquidation amount
 * - Reference: https://github.com/morpho-labs/morpho-liquidation-flash/blob/175823cdaa74894085fc7c1e7ac57b7084f284ed/src/morpho/MorphoAaveAdapter.ts#L33-L75
 *
 * @param collateralTokenInfo - The collateral token info
 * @param totalUserCollateral - The total user collateral
 * @param collateralTokenPriceInUSD - The collateral token price in USD
 * @param borrowTokenInfo - The borrow token info
 * @param totalUserDebt - The total user debt
 * @param borrowTokenPriceInUSD - The borrow token price in USD
 * @param liquidationBonus - The liquidation bonus
 * @param userHealthFactor - The user health factor
 * @param closeFactorHFThreshold - The close factor health factor threshold
 * @returns The maximum liquidation amount
 */
export function getMaxLiquidationAmountCalculation(
  collateralTokenInfo: TokenInfo,
  totalUserCollateral: BigNumber,
  collateralTokenPriceInUSD: BigNumberish,
  borrowTokenInfo: TokenInfo,
  totalUserDebt: BigNumber,
  borrowTokenPriceInUSD: BigNumberish,
  liquidationBonus: BigNumber,
  userHealthFactor: number,
  closeFactorHFThreshold: number,
): {
  toLiquidateAmount: BigNumber;
} {
  if (userHealthFactor >= 1) {
    return {
      toLiquidateAmount: BigNumber.from(0),
    };
  }

  const totalUserCollateralInUSD = totalUserCollateral
    .mul(collateralTokenPriceInUSD)
    .div(pow10(collateralTokenInfo.decimals));

  let toLiquidateAmount = totalUserDebt.div(2);

  if (userHealthFactor < closeFactorHFThreshold) {
    toLiquidateAmount = totalUserDebt;
  }

  const toLiquidateAmountInUSD = toLiquidateAmount
    .mul(borrowTokenPriceInUSD)
    .div(pow10(borrowTokenInfo.decimals));

  if (
    PercentMath.percentMul(toLiquidateAmountInUSD, liquidationBonus).gt(
      totalUserCollateralInUSD,
    )
  ) {
    toLiquidateAmount = PercentMath.percentDiv(
      totalUserCollateralInUSD,
      liquidationBonus,
    )
      .mul(pow10(borrowTokenInfo.decimals))
      .div(borrowTokenPriceInUSD);
  }

  return {
    toLiquidateAmount: toLiquidateAmount,
  };
}

/**
 * Get the maximum liquidation amount of the borrower
 *
 * @param collateralTokenInfo - The collateral token info
 * @param borrowTokenInfo - The borrow token info
 * @param borrowerAddress - Address of the borrower
 * @param callerAddress - Address of the caller
 * @returns The maximum liquidation amount
 */
export async function getMaxLiquidationAmount(
  collateralTokenInfo: TokenInfo,
  borrowTokenInfo: TokenInfo,
  borrowerAddress: string,
  callerAddress: string,
): Promise<{
  toLiquidateAmount: BigNumber;
}> {
  const [
    collateralTokenPriceInUSD,
    borrowTokenPriceInUSD,
    totalUserCollateral,
    totalUserDebt,
    { liquidationBonus },
  ] = await Promise.all([
    getOraclePrice(callerAddress, collateralTokenInfo.address),
    getOraclePrice(callerAddress, borrowTokenInfo.address),
    getUserSupplyBalance(collateralTokenInfo.address, borrowerAddress),
    getUserDebtBalance(borrowTokenInfo.address, borrowerAddress),
    getReserveConfigurationData(collateralTokenInfo.address),
  ]);

  const liquidationBonusBN = BigNumber.from(liquidationBonus);
  const closeFactorHFThreshold = await getCloseFactorHFThreshold(hre);
  const userHealthFactor = await getUserHealthFactor(borrowerAddress);

  return getMaxLiquidationAmountCalculation(
    collateralTokenInfo,
    totalUserCollateral,
    collateralTokenPriceInUSD,
    borrowTokenInfo,
    totalUserDebt,
    borrowTokenPriceInUSD,
    liquidationBonusBN,
    userHealthFactor,
    closeFactorHFThreshold,
  );
}
