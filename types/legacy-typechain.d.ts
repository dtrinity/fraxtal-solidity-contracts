import type { BaseContract, BigNumberish, ContractTransactionResponse } from "ethers";

// Provide legacy aliases for vault contracts that are referenced by older scripts/tests
export interface LegacyDLoopVaultContract extends BaseContract {
  [key: string]: any;
  getCurrentLeverageBps(): Promise<bigint>;
  TARGET_LEVERAGE_BPS(): Promise<bigint>;
  LOWER_BOUND_TARGET_LEVERAGE_BPS(): Promise<bigint>;
  UPPER_BOUND_TARGET_LEVERAGE_BPS(): Promise<bigint>;
  getOracleAddress(): Promise<string>;
  getUnderlyingAssetAddress(): Promise<string>;
  getDUSDAddress(): Promise<string>;
  totalAssets(): Promise<bigint>;
  increaseLeverage(assetAmount: BigNumberish, minPriceInBase: BigNumberish): Promise<ContractTransactionResponse>;
  decreaseLeverage(dusdAmount: BigNumberish, maxPriceInBase: BigNumberish): Promise<ContractTransactionResponse>;
  isTooImbalanced(): Promise<boolean>;
}

declare module "../typechain-types" {
  export type DLoopVaultBase = LegacyDLoopVaultContract;
  export type DLoopVaultCurve = LegacyDLoopVaultContract;
  export type DLoopVaultUniswapV3 = LegacyDLoopVaultContract;
}
