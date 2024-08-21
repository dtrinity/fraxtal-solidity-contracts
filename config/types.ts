import { FeeAmount } from "@uniswap/v3-sdk";
import { Addressable, BigNumberish } from "ethers";

import {
  IInterestRateStrategyParams,
  IReserveParams,
} from "../utils/lending/types";

export interface Config {
  // Only for localhost/hardhat/testnet
  readonly mintInfos:
    | {
        readonly [tokenSymbol: string]: MintConfig[];
      }
    | undefined;
  readonly dex: DEXConfig;
  readonly lending: LendingConfig;
  readonly liquidatorBot: LiquidatorBotConfig;
}

export interface MintConfig {
  readonly amount: BigNumberish;
  readonly toAddress: string;
}

export interface DEXConfig {
  readonly weth9Address: string;
  readonly permit2Address: string;
  readonly oracle: OracleConfig;
  readonly initialPools: DEXPoolConfig[];
}

export interface OracleConfig {
  // The number of price updates per minute
  readonly cardinalityPerMinute: number;
  readonly baseTokenAddress: string;
  readonly baseTokenDecimals: number;
  readonly baseTokenAmountForQuoting: bigint;
  readonly quotePeriodSeconds: number;
}

export interface DEXPoolConfig {
  readonly token0Address: string | Addressable;
  readonly token1Address: string | Addressable;
  readonly fee: FeeAmount;
  readonly initPrice: {
    readonly amount0: number;
    readonly amount1: number;
  };
  readonly inputToken0Amount: number;
  readonly gasLimits: {
    readonly deployPool: number | undefined;
    readonly addLiquidity: number | undefined;
  };
  readonly deadlineInSeconds: number;
}

export interface LendingConfig {
  readonly mockPriceAggregatorInitialUSDPrices:
    | {
        [tokenSymbol: string]: number;
      }
    | undefined;
  readonly providerID: number;
  // Mapping from token symbol to asset address
  readonly reserveAssetAddresses: { [tokenSymbol: string]: string } | undefined;
  // Mapping from token symbol to Chainlink aggregator address
  readonly chainlinkAggregatorAddresses:
    | { [tokenSymbol: string]: string }
    | undefined;
  readonly flashLoanPremium: {
    readonly total: number;
    readonly protocol: number;
  };
  readonly reservesConfig: { [symbol: string]: IReserveParams };
  readonly rateStrategies: IInterestRateStrategyParams[];
  readonly chainlinkEthUsdAggregatorProxy: string;
}

export interface LiquidatorBotConfig {
  readonly flashMinter: string;
  readonly dUSDAddress: string;
  readonly slippageTolerance: number;
  readonly healthFactorThreshold: number;
  readonly healthFactorBatchSize: number;
  readonly reserveBatchSize: number;
  readonly profitableThresholdInUSD: number;
  readonly graphConfig: {
    url: string;
    batchSize: number;
  };
}
