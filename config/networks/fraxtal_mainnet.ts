import { FeeAmount } from "@uniswap/v3-sdk";
import { ethers } from "ethers";

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
  strategyFXS,
  strategyWETH,
  strategyYieldBearingStablecoin,
} from "../../utils/lending/reserves-configs";
import { Config } from "../types";

export const TOKEN_INFO = {
  WFRXETH: {
    address: "0xFC00000000000000000000000000000000000006",
    priceAggregator: "0x89e60b56efD70a1D4FBBaE947bC33cae41e37A72", // Redstone
  },
  DUSD: {
    address: "0x70924f77509dC1EB9384077B12Ca049AA2168d6f",
    priceAggregator: "", // dSwap
  },
  FXS: {
    address: "0xFc00000000000000000000000000000000000002",
    priceAggregator: "0xbf228a9131AB3BB8ca8C7a4Ad574932253D99Cd1", // Redstone
  },
  SFRAX: {
    address: "0xfc00000000000000000000000000000000000008",
    priceAggregator: "", // dSwap
  },
  SFRXETH: {
    address: "0xFC00000000000000000000000000000000000005",
    priceAggregator: "", // dSwap
  },
};

/**
 * Get the configuration for the network
 *
 * @returns The configuration for the network
 */
export function getConfig(): Config {
  return {
    mintInfos: undefined, // No minting on testnet
    dex: {
      weth9Address: TOKEN_INFO.WFRXETH.address,
      permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      oracle: {
        // Fraxtal produces blocks every 2 seconds, 60 / 2 = 30
        cardinalityPerMinute: 30,
        baseTokenAddress: TOKEN_INFO.DUSD.address,
        baseTokenDecimals: AAVE_ORACLE_USD_DECIMALS,
        baseTokenAmountForQuoting: ethers.parseUnits("1000", 6), // 1000 DUSD
        quotePeriodSeconds: 300, // 5 min to balance responsiveness with attack expense
      },
      initialPools: [
        // Need wfrxETH/DUSD pool to bootstrap UI
        {
          token0Address: TOKEN_INFO.WFRXETH.address,
          token1Address: TOKEN_INFO.DUSD.address,
          fee: FeeAmount.MEDIUM, // Fee 30 bps
          initPrice: {
            // Initial price ratio
            amount0: 1,
            amount1: 3800,
          },
          inputToken0Amount: 0.001, // Initial token0 amount for adding liquidity
          gasLimits: {
            // Gas limit for the deployment and initialization
            deployPool: 5000000,
            addLiquidity: 1000000,
          },
          deadlineInSeconds: 600000, // Deadline in seconds
        },
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
        WFRXETH: strategyWETH,
        DUSD: strategyDUSD,
        SFRAX: strategyYieldBearingStablecoin,
        FXS: strategyFXS,
        SFRXETH: strategyETHLST,
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
        "0x89e60b56efD70a1D4FBBaE947bC33cae41e37A72",
    },
    liquidatorBot: {
      flashMinter: TOKEN_INFO.DUSD.address,
      dUSDAddress: TOKEN_INFO.DUSD.address,
      slippageTolerance: 500, // 5% in bps
      healthFactorThreshold: 1,
      healthFactorBatchSize: 10,
      reserveBatchSize: 10,
      profitableThresholdInUSD: 0,
      graphConfig: {
        url: "", // TODO: Add the graph URL for the mainnet
        batchSize: 100,
      },
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
