import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";

import { AAVE_ORACLE_USD_DECIMALS } from "../constants";
import { TokenInfo } from "../token";
import { getMaxLiquidationAmountCalculation } from "./utils";

describe("Test getMaxLiquidationAmountCalculation()", () => {
  const testCases: {
    caseName: string;
    collateralTokenDecimals: number;
    totalUserCollateral: number;
    collateralTokenPriceInUSD: number;
    borrowTokenDecimals: number;
    totalUserDebt: number;
    borrowTokenPriceInUSD: number;
    liquidationBonus: number;
    userHealthFactor: number;
    closeFactorHFThreshold: number;
    expectedToLiquidateAmount: number;
  }[] = [
    {
      caseName: "HF > 1, no liquidation",
      collateralTokenDecimals: 18,
      totalUserCollateral: 100,
      collateralTokenPriceInUSD: 2000,
      borrowTokenDecimals: 18,
      totalUserDebt: 50,
      borrowTokenPriceInUSD: 1,
      liquidationBonus: 1.05,
      userHealthFactor: 1.1,
      closeFactorHFThreshold: 0.95,
      expectedToLiquidateAmount: 0,
    },
    {
      caseName: "closeFactorHFThreshold < HF < 1, liquidate half",
      collateralTokenDecimals: 18,
      totalUserCollateral: 100,
      collateralTokenPriceInUSD: 2000,
      borrowTokenDecimals: 18,
      totalUserDebt: 50,
      borrowTokenPriceInUSD: 1,
      liquidationBonus: 1.05,
      userHealthFactor: 0.96,
      closeFactorHFThreshold: 0.95,
      expectedToLiquidateAmount: 25,
    },
    {
      caseName: "HF < closeFactorHFThreshold, liquidate all",
      collateralTokenDecimals: 18,
      totalUserCollateral: 100,
      collateralTokenPriceInUSD: 2000,
      borrowTokenDecimals: 18,
      totalUserDebt: 50,
      borrowTokenPriceInUSD: 1,
      liquidationBonus: 1.05,
      userHealthFactor: 0.94,
      closeFactorHFThreshold: 0.95,
      expectedToLiquidateAmount: 50,
    },
    {
      caseName: "HF < 0.95, liquidate all, different decimals",
      collateralTokenDecimals: 6,
      totalUserCollateral: 100,
      collateralTokenPriceInUSD: 2000,
      borrowTokenDecimals: 6,
      totalUserDebt: 50,
      borrowTokenPriceInUSD: 1,
      liquidationBonus: 1.05,
      userHealthFactor: 0.94,
      closeFactorHFThreshold: 0.95,
      expectedToLiquidateAmount: 50,
    },
  ];

  for (const testCase of testCases) {
    it(testCase.caseName, async () => {
      const collateralTokenInfo: TokenInfo = {
        address: "",
        symbol: "",
        name: "",
        decimals: testCase.collateralTokenDecimals,
      };
      const borrowTokenInfo = {
        address: "",
        symbol: "",
        name: "",
        decimals: testCase.borrowTokenDecimals,
      };
      const priceDecimals = AAVE_ORACLE_USD_DECIMALS;
      const res = getMaxLiquidationAmountCalculation(
        collateralTokenInfo,
        toTokenAmount(
          testCase.totalUserCollateral,
          testCase.collateralTokenDecimals,
        ),
        toTokenAmount(testCase.collateralTokenPriceInUSD, priceDecimals),
        borrowTokenInfo,
        toTokenAmount(testCase.totalUserDebt, testCase.borrowTokenDecimals),
        toTokenAmount(testCase.borrowTokenPriceInUSD, priceDecimals),
        toTokenAmount(testCase.liquidationBonus, 4), // 1.05 * 1e4
        testCase.userHealthFactor,
        testCase.closeFactorHFThreshold,
      );
      expect(res).toBeDefined();
      expect(res.toLiquidateAmount.toString()).toEqual(
        toTokenAmount(
          testCase.expectedToLiquidateAmount,
          borrowTokenInfo.decimals,
        ).toString(),
      );
    });
  }
});

/**
 * Convert the token amount to the BigNumber with the decimals
 *
 * @param amount - The token amount
 * @param decimals - The number of decimals
 * @returns The token amount
 */
function toTokenAmount(amount: number, decimals: number): BigNumber {
  const res = ethers.parseUnits(amount.toString(), decimals);
  return BigNumber.from(res.toString());
}
