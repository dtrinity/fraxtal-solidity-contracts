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
  readonly dusd: DUSDConfig;
  readonly dLoopUniswapV3: DLoopUniswapV3Config | undefined;
  readonly dLoopCurve: DLoopCurveConfig | undefined;
  readonly oracleAggregator: OracleAggregatorConfig;
  readonly curve: CurveConfig;
  readonly liquidatorBotUniswapV3?: LiquidatorBotUniswapV3Config;
  readonly liquidatorBotCurve?: LiquidatorBotCurveConfig;
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
  readonly incentivesVault: string;
  readonly incentivesEmissionManager: string;
}

export interface LiquidatorBotConfig {
  readonly flashMinter: string;
  readonly dUSDAddress: string;
  readonly slippageTolerance: number;
  readonly healthFactorThreshold: number;
  readonly healthFactorBatchSize: number;
  readonly reserveBatchSize: number;
  readonly profitableThresholdInUSD: number;
  readonly liquidatingBatchSize: number;
  readonly graphConfig: {
    url: string;
    batchSize: number;
  };
}

export interface LiquidatorBotUniswapV3Config extends LiquidatorBotConfig {
  // Mapping from token address to the proxy contract address
  readonly proxyContractMap: {
    [tokenAddress: string]: string;
  };
}

export interface LiquidatorBotCurveConfig extends LiquidatorBotConfig {
  readonly swapRouter: string;
  readonly maxSlippageSurplusSwapBps: number;
  readonly defaultSwapSlippageBufferBps: number;
  // Mapping from token address to whether it requires unstaking
  readonly isUnstakeTokens: {
    [tokenAddress: string]: boolean;
  };
  readonly defaultSwapParamsList: {
    readonly inputToken: string;
    readonly outputToken: string;
    readonly swapExtraParams: CurveSwapExtraParams;
    readonly reverseSwapExtraParams: CurveSwapExtraParams;
  }[];
  // Mapping from token address to the proxy contract address
  readonly proxyContractMap: {
    [tokenAddress: string]: string;
  };
}

export interface DUSDConfig {
  readonly address: string;
  readonly amoVaults?: {
    // We can change this to an array when we have multiple Uniswap V3 vaults later
    readonly uniswapV3?: {
      readonly pool: string;
      readonly nftPositionManager: string;
      readonly router: string;
    };
    readonly curveStableSwapNG?: {
      readonly pool: string;
      readonly router: string;
    };
  };
}

export interface UniswapV3SwapPath {
  // The addresses of the tokens in the path, from input to output (e.g., USDC -> WETH -> DAI means [USDC, WETH, DAI])
  readonly tokenAddressesPath: string[];
  // The corresponding fee amounts for each consecutive pair of tokens in the path (e.g., [3000, 500] means 0.3% fee for USDC -> WETH and 0.5% fee for WETH -> DAI)
  readonly poolFeeSchemaPath: number[];
}

export interface DLoopUniswapV3Config {
  readonly vaults: {
    readonly underlyingAssetAddress: string;
    readonly dusdAddress: string;
    readonly defaultDusdToUnderlyingSwapPath: UniswapV3SwapPath;
    readonly defaultUnderlyingToDusdSwapPath: UniswapV3SwapPath;
    readonly targetLeverageBps: number;
    readonly swapSlippageTolerance: number;
    readonly maxSubsidyBps: number;
  }[];
}

export interface CurveSwapExtraParams {
  readonly route: string[];
  readonly swapParams: number[][];
  readonly swapSlippageBufferBps: number;
}

export interface DLoopCurveConfig {
  readonly dUSDAddress: string;
  readonly vaults: {
    readonly underlyingAssetAddress: string;
    readonly swapRouter: string;
    readonly defaultDusdToUnderlyingSwapExtraParams: CurveSwapExtraParams;
    readonly defaultUnderlyingToDusdSwapExtraParams: CurveSwapExtraParams;
    readonly targetLeverageBps: number;
    readonly swapSlippageTolerance: number;
    readonly maxSubsidyBps: number;
    readonly maxSlippageSurplusSwapBps: number;
  }[];
}

export interface OracleWrapperAsset {
  readonly assetAddress: string;
  readonly oracleWrapperAddress: string;
}

export interface OracleAggregatorConfig {
  readonly dUSDAddress: string;
  readonly dexOracleAssets: {
    [key: string]: string;
  };
  readonly api3OracleAssets: {
    plainApi3OracleWrappers: {
      [key: string]: string;
    };
    compositeApi3OracleWrappersWithThresholding: {
      [key: string]: {
        feedAsset: string;
        proxy1: string;
        proxy2: string;
        lowerThresholdInBase1: bigint;
        fixedPriceInBase1: bigint;
        lowerThresholdInBase2: bigint;
        fixedPriceInBase2: bigint;
      };
    };
  };
  readonly curveOracleAssets: {
    [key: string]: {
      pool: string;
      compositeAPI3Feed?: {
        api3Asset: string;
        api3Wrapper: string;
        curveLowerThresholdInBase: bigint;
        curveFixedPriceInBase: bigint;
        api3LowerThresholdInBase: bigint;
        api3FixedPriceInBase: bigint;
      };
    };
  };
  readonly priceDecimals: number;
  readonly hardDusdPeg: number;
}

export interface CurveConfig {
  readonly router: string;
  readonly tools?: {
    readonly httpServiceHost: string; // e.g. "http://localhost:3000"
  };
}
