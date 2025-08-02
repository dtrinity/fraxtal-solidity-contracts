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
  readonly walletAddresses: WalletAddresses;
  readonly dex?: DEXConfig;
  readonly lending: LendingConfig;
  readonly dusd: DUSDConfig;
  readonly dLoop: DLoopConfig;
  readonly oracleAggregator: OracleAggregatorConfig;
  readonly curve: CurveConfig;
  readonly liquidatorBotUniswapV3?: LiquidatorBotUniswapV3Config;
  readonly liquidatorBotCurve?: LiquidatorBotCurveConfig;
  readonly liquidatorBotOdos?: LiquidatorBotOdosConfig;
  readonly odos?: OdosConfig;
  readonly dStake?: DStakeConfig;
  readonly vesting?: VestingConfig;
  readonly dStables?: DStablesConfig;
  // Optional: Override token registry for specific networks
  readonly tokenRegistry?: TokenRegistryConfig;
}

export interface TokenRegistryConfig {
  readonly tokens?: {
    readonly [symbol: string]: {
      readonly strategy: "mint" | "deploy-only" | "external";
      readonly address?: string;
      readonly aliases?: string[];
    };
  };
}

export interface WalletAddresses {
  readonly governanceMultisig: string;
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
  // Mapping from token address to the proxy contract address
  readonly proxyContractMap: {
    [tokenAddress: string]: string;
  };
  // Mapping from token address to whether it requires unstaking
  readonly isUnstakeTokens: {
    [tokenAddress: string]: boolean;
  };
}

export interface LiquidatorBotUniswapV3Config extends LiquidatorBotConfig {}

export interface LiquidatorBotCurveConfig extends LiquidatorBotConfig {
  readonly swapRouter: string;
  readonly maxSlippageSurplusSwapBps: number;
  readonly defaultSwapSlippageBufferBps: number;
  readonly defaultSwapParamsList: {
    readonly inputToken: string;
    readonly outputToken: string;
    readonly swapExtraParams: CurveSwapExtraParams;
    readonly reverseSwapExtraParams: CurveSwapExtraParams;
  }[];
}

export interface LiquidatorBotOdosConfig extends LiquidatorBotConfig {
  readonly odosRouter: string;
  readonly odosApiUrl: string;
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

export interface DLoopConfig {
  readonly dUSDAddress: string;
  readonly coreVaults?: { [vaultName: string]: DLoopCoreConfig };
  readonly depositors?: {
    uniswapV3?: DLoopDepositorUniswapV3Config;
    curve?: DLoopDepositorCurveConfig;
    odos?: DLoopDepositorOdosConfig;
  };
  readonly withdrawers?: {
    uniswapV3?: DLoopWithdrawerUniswapV3Config;
    curve?: DLoopWithdrawerCurveConfig;
    odos?: DLoopWithdrawerOdosConfig;
  };
}

export interface DLoopCoreConfig {
  readonly venue: "dlend";
  readonly name: string;
  readonly symbol: string;
  readonly underlyingAsset: string;
  readonly dStable: string;
  readonly targetLeverageBps: number;
  readonly lowerBoundTargetLeverageBps: number;
  readonly upperBoundTargetLeverageBps: number;
  readonly maxSubsidyBps: number;
  readonly extraParams: { [key: string]: any }; // Add more params here
}

export interface UniswapV3SwapPath {
  // The addresses of the tokens in the path, from input to output (e.g., USDC -> WETH -> DAI means [USDC, WETH, DAI])
  readonly tokenAddressesPath: string[];
  // The corresponding fee amounts for each consecutive pair of tokens in the path (e.g., [3000, 500] means 0.3% fee for USDC -> WETH and 0.5% fee for WETH -> DAI)
  readonly poolFeeSchemaPath: number[];
}

export interface CurveSwapExtraParams {
  readonly route: string[];
  readonly swapParams: number[][];
  readonly swapSlippageBufferBps: number;
}

export interface DLoopDepositorUniswapV3Config {
  readonly defaultDusdToUnderlyingSwapPath: UniswapV3SwapPath;
  readonly defaultUnderlyingToDusdSwapPath: UniswapV3SwapPath;
}

export interface DLoopDepositorCurveConfig {
  readonly swapRouter: string;
  readonly defaultSwapParamsList: {
    readonly inputToken: string;
    readonly outputToken: string;
    readonly swapExtraParams: CurveSwapExtraParams;
    readonly reverseSwapExtraParams: CurveSwapExtraParams;
  }[];
}

export interface DLoopDepositorOdosConfig {
  readonly router: string;
}

export interface DLoopWithdrawerUniswapV3Config {
  readonly defaultDusdToUnderlyingSwapPath: UniswapV3SwapPath;
  readonly defaultUnderlyingToDusdSwapPath: UniswapV3SwapPath;
}

export interface DLoopWithdrawerCurveConfig {
  readonly swapRouter: string;
  readonly defaultSwapParamsList: {
    readonly inputToken: string;
    readonly outputToken: string;
    readonly swapExtraParams: CurveSwapExtraParams;
    readonly reverseSwapExtraParams: CurveSwapExtraParams;
  }[];
}

export interface DLoopWithdrawerOdosConfig {
  readonly router: string;
}

export interface OracleWrapperAsset {
  readonly assetAddress: string;
  readonly oracleWrapperAddress: string;
}

export interface OracleAggregatorConfig {
  readonly dUSDAddress: string;
  readonly priceDecimals: number;
  readonly hardDusdPeg: number;
  readonly dexOracleAssets: {
    [key: string]: string;
  };
  readonly api3OracleAssets: {
    plainApi3OracleWrappers: {
      [key: string]: string;
    };
    api3OracleWrappersWithThresholding: {
      [key: string]: {
        proxy: string;
        lowerThreshold: bigint;
        fixedPrice: bigint;
      };
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
    curveApi3CompositeOracles: {
      [key: string]: {
        pool: string;
        compositeAPI3Feed: {
          api3Asset: string;
          api3Proxy: string;
          curveLowerThresholdInBase: bigint;
          curveFixedPriceInBase: bigint;
          api3LowerThresholdInBase: bigint;
          api3FixedPriceInBase: bigint;
        };
      };
    };
  };
}

export interface CurveConfig {
  readonly router: string;
  readonly tools?: {
    readonly httpServiceHost: string; // e.g. "http://localhost:3000"
  };
}

export interface OdosConfig {
  readonly router: string;
}

export interface DStakeConfig {
  readonly [instanceKey: string]: DStakeInstanceConfig;
}
export interface DStakeAdapterConfig {
  readonly vaultAsset: string;
  readonly adapterContract: string;
}
export interface DLendRewardManagerConfig {
  readonly managedVaultAsset: string;
  readonly dLendAssetToClaimFor: string;
  readonly dLendRewardsController: string;
  readonly treasury: string;
  readonly maxTreasuryFeeBps: number;
  readonly initialTreasuryFeeBps: number;
  readonly initialExchangeThreshold: string;
}

export interface DStakeInstanceConfig {
  readonly dStable: string;
  readonly name: string;
  readonly symbol: string;
  readonly initialAdmin: string;
  readonly initialFeeManager: string;
  readonly initialWithdrawalFeeBps: number;
  readonly adapters: DStakeAdapterConfig[];
  readonly defaultDepositVaultAsset: string;
  readonly collateralVault: string;
  readonly collateralExchangers: string[];
  readonly dLendRewardManager?: DLendRewardManagerConfig;
}

export interface VestingConfig {
  readonly name: string;
  readonly symbol: string;
  readonly dstakeToken: string;
  readonly vestingPeriod: number;
  readonly maxTotalSupply: string;
  readonly initialOwner: string;
  readonly minDepositThreshold: string;
}

export interface DStablesConfig {
  readonly [key: string]: DStableInstanceConfig;
}

export interface DStableInstanceConfig {
  readonly collaterals: string[];
  readonly initialFeeReceiver: string;
  readonly initialRedemptionFeeBps: number;
  readonly collateralRedemptionFees?: Record<string, number>;
}
