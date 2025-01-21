import {
  rateStrategyHighLiquidityStable,
  rateStrategyHighLiquidityVolatile,
  rateStrategyMediumLiquidityStable,
  rateStrategyMediumLiquidityVolatile,
} from "./rate-strategies";
import { eContractid, IReserveParams } from "./types";

// Explainer: https://docs.aave.com/developers/guides/governance-guide/asset-listing
export const strategyDUSD: IReserveParams = {
  strategy: rateStrategyHighLiquidityStable,
  // CAUTION: If LTV is > 0, people may loop and dillute other borrowers
  baseLTVAsCollateral: "0", // 0 Don't allow dUSD as collateral to prevent subsidy syphoning
  liquidationThreshold: "9000", // 9500 bps = 95%
  liquidationBonus: "10500", // 10500 bps = 105%, amount over 100% is the fee portion
  liquidationProtocolFee: "7000", // 7000 bps = 70%
  borrowingEnabled: true,
  stableBorrowRateEnabled: false, // No stable rates due to vulnerability
  flashLoanEnabled: true,
  reserveDecimals: "6",
  aTokenImpl: eContractid.AToken,
  reserveFactor: "1000", // 1000 bps = 10%
  supplyCap: "400000", // these are decimal units, not raw on-chain integer values
  borrowCap: "380000",
  debtCeiling: "0",
  borrowableIsolation: false,
};

export const strategyWETH: IReserveParams = {
  strategy: rateStrategyHighLiquidityVolatile,
  baseLTVAsCollateral: "8000",
  liquidationThreshold: "8500",
  liquidationBonus: "10500",
  liquidationProtocolFee: "7000", // 70%
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  flashLoanEnabled: true,
  reserveDecimals: "18",
  aTokenImpl: eContractid.AToken,
  reserveFactor: "1000",
  supplyCap: "300",
  borrowCap: "50",
  debtCeiling: "0",
  borrowableIsolation: false,
};

export const strategyYieldBearingStablecoin: IReserveParams = {
  strategy: rateStrategyMediumLiquidityStable,
  baseLTVAsCollateral: "8000",
  liquidationThreshold: "8500",
  liquidationBonus: "10500",
  liquidationProtocolFee: "7000", // 70%
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  flashLoanEnabled: true,
  reserveDecimals: "18",
  aTokenImpl: eContractid.AToken,
  reserveFactor: "1000",
  supplyCap: "1000000",
  borrowCap: "200000",
  debtCeiling: "0",
  borrowableIsolation: false,
};

export const strategyFXS: IReserveParams = {
  strategy: rateStrategyMediumLiquidityVolatile,
  baseLTVAsCollateral: "6000",
  liquidationThreshold: "7000",
  liquidationBonus: "11000",
  liquidationProtocolFee: "7000", // 70%
  borrowingEnabled: true,
  stableBorrowRateEnabled: false,
  flashLoanEnabled: true,
  reserveDecimals: "18",
  aTokenImpl: eContractid.AToken,
  reserveFactor: "1000",
  supplyCap: "250000",
  borrowCap: "50000",
  debtCeiling: "0",
  borrowableIsolation: false,
};

export const strategyETHLST: IReserveParams = {
  strategy: rateStrategyMediumLiquidityVolatile,
  baseLTVAsCollateral: "8000",
  liquidationThreshold: "8500",
  liquidationBonus: "10800",
  liquidationProtocolFee: "7000", // 70%
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  flashLoanEnabled: true,
  reserveDecimals: "18",
  aTokenImpl: eContractid.AToken,
  reserveFactor: "1000",
  supplyCap: "300",
  borrowCap: "50",
  debtCeiling: "0",
  borrowableIsolation: false,
};

export const strategyFXB20291231: IReserveParams = {
  strategy: rateStrategyMediumLiquidityVolatile,
  baseLTVAsCollateral: "6000",
  liquidationThreshold: "6500",
  liquidationBonus: "10500",
  liquidationProtocolFee: "7000", // 70%
  borrowingEnabled: false,
  stableBorrowRateEnabled: false,
  flashLoanEnabled: true,
  reserveDecimals: "18",
  aTokenImpl: eContractid.AToken,
  reserveFactor: "1000",
  supplyCap: "1340000",
  borrowCap: "0",
  debtCeiling: "0",
  borrowableIsolation: false,
};
