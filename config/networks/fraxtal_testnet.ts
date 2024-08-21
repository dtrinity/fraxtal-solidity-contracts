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

// Must be an oracle that conforms to the Chainlink aggregator interface, e.g. Redstone classic
const ETH_CHAINLINK_ORACLE_ADDRESS =
  "0x2fB93C42D7727C6A69B66943008C26Ec7701eAd1";

export const TOKEN_INFO = {
  wfrxETH: {
    address: "0xFC00000000000000000000000000000000000006",
    priceAggregator: ETH_CHAINLINK_ORACLE_ADDRESS, // Required by Aave UI Helpers
  },
  dUSD: {
    address: "0x4D6E79013212F10A026A1FB0b926C9Fd0432b96c",
    priceAggregator: "", // No oracle
  },
  FXS: {
    address: "0x98182ec55Be5091d653F9Df016fb1070add7a16E",
    priceAggregator: "", // No oracle
  },
  sFRAX: {
    address: "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
    priceAggregator: "", // No oracle
  },
  sfrxETH: {
    address: "0x05A09C8BF515D0035e1Af22b24487928913475Bd",
    priceAggregator: "", // No oracle
  },
  FRAX: {
    address: "0x2CAb811d351B4eF492D8C197E09939F1C9f54330",
    priceAggregator: "", // No oracle
  },
  USDe: {
    address: "0x78C4fa90703C8D905b83416Cda5b2F77A8C386C5",
    priceAggregator: "", // No oracle
  },
  DAI: {
    address: "0x828a7248daD914435F452D73363491Ab7ec4D8f4",
    priceAggregator: "", // No oracle
  },
  sUSDe: {
    address: "0x99Df29568C899D0854017de5D265aAF42Cb123fA",
    priceAggregator: "", // No oracle
  },
  sDAI: {
    address: "0x4CB47b0FD8f8EfF846889D3BEaD1c33bc93C7FD6",
    priceAggregator: "", // No oracle
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
      weth9Address: TOKEN_INFO.wfrxETH.address,
      permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      oracle: {
        // Fraxtal produces blocks every 2 seconds, 60 / 2 = 30
        cardinalityPerMinute: 30,
        baseTokenAddress: TOKEN_INFO.dUSD.address,
        baseTokenDecimals: AAVE_ORACLE_USD_DECIMALS,
        baseTokenAmountForQuoting: ethers.parseUnits("1000", 6), // 1000 DUSD
        quotePeriodSeconds: 1, // 1 second, for faster testnet simulations
      },
      initialPools: [
        // Need wfrxETH/DUSD pool to bootstrap UI
        {
          token0Address: TOKEN_INFO.wfrxETH.address,
          token1Address: TOKEN_INFO.dUSD.address,
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
      // No mock price aggregator for testnet, it is deployed separately to mimic mainnet
      mockPriceAggregatorInitialUSDPrices: undefined,
      // Using Chain IDs as the providerID to prevent collission
      // Fraxtal Testnet: https://chainlist.org/chain/2522
      providerID: 2522,
      reserveAssetAddresses: getTokenAddresses(),
      chainlinkAggregatorAddresses: getChainlinkAggregatorAddresses(),
      flashLoanPremium: {
        // 5bps total for non-whitelisted flash borrowers
        total: 0.0003e4, // 0.03%
        protocol: 0.0002e4, // 0.02%
      },
      reservesConfig: {
        // The symbol keys here must match those in TOKEN_INFO above
        wfrxETH: strategyWETH,
        dUSD: strategyDUSD,
        sFRAX: strategyYieldBearingStablecoin,
        FXS: strategyFXS,
        sfrxETH: strategyETHLST,
        sUSDe: strategyYieldBearingStablecoin,
        sDAI: strategyYieldBearingStablecoin,
      },
      // No stable rate borrowing, feature is disabled
      rateStrategies: [
        rateStrategyHighLiquidityVolatile,
        rateStrategyMediumLiquidityVolatile,
        rateStrategyHighLiquidityStable,
        rateStrategyMediumLiquidityStable,
      ],
      chainlinkEthUsdAggregatorProxy: ETH_CHAINLINK_ORACLE_ADDRESS, // Required by Aave UI Helpers
    },
    liquidatorBot: {
      flashMinter: TOKEN_INFO.dUSD.address,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      slippageTolerance: 3000, // 30% in bps
      healthFactorThreshold: 1,
      healthFactorBatchSize: 5,
      reserveBatchSize: 5,
      profitableThresholdInUSD: 0,
      graphConfig: {
        url: "https://fraxtal-testnet-subgraph.testnet.dtrinity.org/subgraphs/name/stablyio-aave-v3-messari-testnet/",
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
