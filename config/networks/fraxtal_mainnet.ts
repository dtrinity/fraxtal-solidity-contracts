import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { API3_PRICE_DECIMALS } from "../../test/oracle_aggregator/constants";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import {
  rateStrategyHighLiquidityStable,
  rateStrategyHighLiquidityVolatile,
  rateStrategyMediumLiquidityStable,
  rateStrategyMediumLiquidityVolatile,
} from "../../utils/lending/rate-strategies";
import {
  strategyDUSD,
  strategyETHLST,
  strategyWETH,
  strategyYieldBearingStablecoin,
} from "../../utils/lending/reserves-configs";
import { Config } from "../types";

export const TOKEN_INFO = {
  wfrxETH: {
    address: "0xFC00000000000000000000000000000000000006",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  sfrxETH: {
    address: "0xFC00000000000000000000000000000000000005",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  dUSD: {
    address: "0x788D96f655735f52c676A133f4dFC53cEC614d4A",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  FRAX: {
    address: "0xfc00000000000000000000000000000000000001",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  sFRAX: {
    address: "0xfc00000000000000000000000000000000000008",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  DAI: {
    address: "0xf6a011fac307f55cd4ba8e43b8b93f39808ddaa9",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  sDAI: {
    address: "0x09eAdcBAa812A4C076c3a6cDe765DC4a22E0d775",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  USDe: {
    address: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  sUSDe: {
    address: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  USDC: {
    address: "0xDcc0F2D8F90FDe85b10aC1c8Ab57dc0AE946A543",
    priceAggregator: "", // Fall back to OracleAggregator
  },
};

/**
 * Get the configuration for the network
 *
 * @param _hre - Hardhat Runtime Environment
 * @returns The configuration for the network
 */
export async function getConfig(
  _hre: HardhatRuntimeEnvironment,
): Promise<Config> {
  return {
    mintInfos: undefined, // No minting on testnet
    dex: {
      weth9Address: TOKEN_INFO.wfrxETH.address,
      permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      oracle: {
        // Fraxtal produces blocks every 2 seconds, 60 / 2 = 30
        cardinalityPerMinute: 30,
        baseTokenAddress: TOKEN_INFO.dUSD.address,
        baseTokenDecimals: AAVE_ORACLE_USD_DECIMALS,
        baseTokenAmountForQuoting: ethers.parseUnits("1000", 6), // 1000 DUSD
        quotePeriodSeconds: 300, // 5 min to balance responsiveness with attack expense
      },
      initialPools: [
        // Need wfrxETH/DUSD pool to bootstrap UI
        // {
        //   token0Address: TOKEN_INFO.wfrxETH.address,
        //   token1Address: TOKEN_INFO.dUSD.address,
        //   fee: FeeAmount.MEDIUM, // Fee 30 bps
        //   initPrice: {
        //     // Initial price ratio
        //     amount0: 1,
        //     amount1: 3800,
        //   },
        //   inputToken0Amount: 0.001, // Initial token0 amount for adding liquidity
        //   gasLimits: {
        //     // Gas limit for the deployment and initialization
        //     deployPool: 5000000,
        //     addLiquidity: 1000000,
        //   },
        //   deadlineInSeconds: 600000, // Deadline in seconds
        // },
      ],
    },
    lending: {
      // No mock price aggregator for mainnet
      mockPriceAggregatorInitialUSDPrices: undefined,
      // Using Chain IDs as the providerID to prevent collission
      // Fraxtal Testnet: https://chainlist.org/chain/252
      providerID: 252,
      reserveAssetAddresses: getTokenAddresses(),
      chainlinkAggregatorAddresses: getChainlinkAggregatorAddresses(),
      flashLoanPremium: {
        // 5bps total for non-whitelisted flash borrowers
        total: 0.0003e4, // 0.03%
        protocol: 0.0002e4, // 0.02%
      },
      reservesConfig: {
        // The symbol keys here must match those in TOKEN_INFO above
        dUSD: strategyDUSD,
        wfrxETH: strategyWETH,
        sfrxETH: strategyETHLST,
        sFRAX: strategyYieldBearingStablecoin,
        sUSDe: strategyYieldBearingStablecoin,
      },
      // No stable rate borrowing, feature is disabled
      rateStrategies: [
        rateStrategyHighLiquidityVolatile,
        rateStrategyMediumLiquidityVolatile,
        rateStrategyHighLiquidityStable,
        rateStrategyMediumLiquidityStable,
      ],
      // ref: https://docs.redstone.finance/docs/smart-contract-devs/price-feeds
      chainlinkEthUsdAggregatorProxy:
        "0x89e60b56efD70a1D4FBBaE947bC33cae41e37A72", // Redstone
      incentivesVault: "0x674679896A8Efd4b0BCF59F5503A3d6807172791", // Safe on Fraxtal
      incentivesEmissionManager: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // Gov Admin
    },
    liquidatorBot: {
      flashMinter: TOKEN_INFO.dUSD.address,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      slippageTolerance: 500, // 5% in bps
      healthFactorThreshold: 1,
      healthFactorBatchSize: 10,
      reserveBatchSize: 10,
      profitableThresholdInUSD: 0,
      liquidatingBatchSize: 200,
      graphConfig: {
        url: "", // TODO: Add the graph URL for the mainnet
        batchSize: 100,
      },
    },
    dusd: {
      address: TOKEN_INFO.dUSD.address,
      amoVaults: {
        curveStableSwapNG: {
          pool: "0x9CA648D2f51098941688Db9a0beb1DadC2D1B357", // FRAX/dUSD pool
          router: "0x9f2Fa7709B30c75047980a0d70A106728f0Ef2db",
        },
      },
    },
    dLoopUniswapV3: {
      vaults: [
        // {
        //   dusdAddress: TOKEN_INFO.dUSD.address,
        //   underlyingAssetAddress: TOKEN_INFO.sFRAX.address,
        //   defaultDusdToUnderlyingSwapPath: {
        //     tokenAddressesPath: [
        //       TOKEN_INFO.dUSD.address,
        //       TOKEN_INFO.sFRAX.address,
        //     ],
        //     poolFeeSchemaPath: [FeeAmount.MEDIUM],
        //   }, // TODO: Add the actual swap path for the mainnet
        //   defaultUnderlyingToDusdSwapPath: {
        //     tokenAddressesPath: [
        //       TOKEN_INFO.sFRAX.address,
        //       TOKEN_INFO.dUSD.address,
        //     ],
        //     poolFeeSchemaPath: [FeeAmount.MEDIUM],
        //   }, // TODO: Add the actual swap path for the mainnet
        //   targetLeverageBps: 300 * 100 * ONE_BPS_UNIT, // 300% leverage, meaning 3x leverage
        //   swapSlippageTolerance: 5 * 100 * ONE_BPS_UNIT, // 5% slippage tolerance
        //   maxSubsidyBps: 2 * 100 * ONE_BPS_UNIT, // 2% subsidy, meaning 1x leverage
        // },
      ],
    },
    dLoopCurve: {
      dUSDAddress: TOKEN_INFO.dUSD.address,
      vaults: [
        // {
        //   underlyingAssetAddress: TOKEN_INFO.sUSDe.address,
        //   swapRouter: CURVE_CONTRACTS.router,
        //   defaultDusdToUnderlyingSwapExtraParams: {
        //     route: [TOKEN_INFO.dUSD.address, TOKEN_INFO.sUSDe.address],
        //     swapParams: [],
        //     swapSlippageBufferBps: 5000, // 50% slippage buffer
        //   },
        //   defaultUnderlyingToDusdSwapExtraParams: {
        //     route: [TOKEN_INFO.sUSDe.address, TOKEN_INFO.dUSD.address],
        //     swapParams: [],
        //     swapSlippageBufferBps: 5000, // 50% slippage buffer
        //   },
        //   targetLeverageBps: 300 * 100 * ONE_BPS_UNIT, // 300% leverage, meaning 3x leverage
        //   swapSlippageTolerance: 5 * 100 * ONE_BPS_UNIT, // 5% slippage tolerance
        //   maxSubsidyBps: 2 * 100 * ONE_BPS_UNIT, // 2% subsidy, meaning 1x leverage
        //   maxSlippageSurplusSwapBps: 10 * 100 * ONE_BPS_UNIT, // 5% slippage surplus swap
        // },
      ],
    },
    oracleAggregator: {
      hardDusdPeg: 10 ** AAVE_ORACLE_USD_DECIMALS,
      priceDecimals: AAVE_ORACLE_USD_DECIMALS,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      dexOracleAssets: {},
      api3OracleAssets: {
        plainApi3OracleWrappers: {
          [TOKEN_INFO.wfrxETH.address]:
            "0x5b0cf2b36a65a6BB085D501B971e4c102B9Cd473", // ETH/USD
          [TOKEN_INFO.FRAX.address]:
            "0xB963A9B6A19D3ed0E4038af0ebBa603CA3683BFE", // FRAX/USD
          [TOKEN_INFO.DAI.address]:
            "0x85b6dD270538325A9E0140bd6052Da4ecc18A85c", // DAI/USD
          [TOKEN_INFO.USDe.address]:
            "0x22a35f4BDD167EAF7Cbf0C0Dc0C2001071714cc6", // USDe/USD
          [TOKEN_INFO.USDC.address]:
            "0xD3C586Eec1C6C3eC41D276a23944dea080eDCf7f", // USDC/USD
        },
        compositeApi3OracleWrappersWithThresholding: {
          [TOKEN_INFO.sfrxETH.address]: {
            feedAsset: TOKEN_INFO.sfrxETH.address,
            proxy1: "0x9C4EE9A08AA53cF1aBd2dAb41e3C3D9A738F949D", // sfrxETH/frxETH
            proxy2: "0x5b0cf2b36a65a6BB085D501B971e4c102B9Cd473", // ETH/USD
            // No thresholdling
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 0n,
            fixedPriceInBase2: 0n,
          },
          [TOKEN_INFO.sFRAX.address]: {
            feedAsset: TOKEN_INFO.sFRAX.address,
            proxy1: "0xC0c16E9a1DCD8097A94902e858Dc6801df774EcF", // sFRAX/FRAX
            proxy2: "0xB963A9B6A19D3ed0E4038af0ebBa603CA3683BFE", // FRAX/USD
            // Don't allow FRAX to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
          [TOKEN_INFO.sDAI.address]: {
            feedAsset: TOKEN_INFO.sDAI.address,
            proxy1: "0x35e3Dc128030646d5A83D53c3350345F7A796A0a", // sDAI/DAI
            proxy2: "0x85b6dD270538325A9E0140bd6052Da4ecc18A85c", // DAI/USD
            // Don't allow DAI to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
          [TOKEN_INFO.sUSDe.address]: {
            feedAsset: TOKEN_INFO.sUSDe.address,
            proxy1: "0x1d28d1Eb2B9E7486420FE3E7E42F6a7fb6ec9fcf", // sUSDe/USDe
            proxy2: "0x22a35f4BDD167EAF7Cbf0C0Dc0C2001071714cc6", // USDe/USD
            // Don't allow USDe to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
        },
      },
    },
    curve: {
      // Source: https://docs.curve.fi/references/deployed-contracts/#curve-router
      router: "0x9f2Fa7709B30c75047980a0d70A106728f0Ef2db",
    },
  };
}

/**
 * Get the mapping from token symbol to token address based on the TOKEN_INFO
 *
 * @returns The mapping from token symbol to token address
 */
function getTokenAddresses(): { [symbol: string]: string } {
  const tokenAddresses: { [symbol: string]: string } = {};

  for (const [symbol, tokenInfo] of Object.entries(TOKEN_INFO)) {
    tokenAddresses[symbol] = tokenInfo.address;
  }

  return tokenAddresses;
}

/**
 * Get the mapping from token symbol to Chainlink aggregator address based on the TOKEN_INFO
 *
 * @returns The mapping from token symbol to Chainlink aggregator address
 */
function getChainlinkAggregatorAddresses(): { [symbol: string]: string } {
  const chainlinkAggregatorAddresses: { [symbol: string]: string } = {};

  for (const [symbol, tokenInfo] of Object.entries(TOKEN_INFO)) {
    chainlinkAggregatorAddresses[symbol] = tokenInfo.priceAggregator;
  }

  return chainlinkAggregatorAddresses;
}
