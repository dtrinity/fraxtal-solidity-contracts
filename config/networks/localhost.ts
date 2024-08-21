import { FeeAmount } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { TEST_WETH9_ID } from "../../utils/dex/deploy-ids";
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

/**
 * Get the configuration for the network
 *
 * @param hre - Hardhat Runtime Environment
 * @returns The configuration for the network
 */
export async function getConfig(
  hre: HardhatRuntimeEnvironment,
): Promise<Config> {
  // Allow the deployment to be null as this function maybe called before the deployment of the test tokens
  const WFRXETHDeployment = await hre.deployments.getOrNull(TEST_WETH9_ID);
  const DUSDDeployment = await hre.deployments.getOrNull("DUSD");
  // const FXSDeployment = await deployments.getOrNull("FXS");
  // const SFRAXDeployment = await deployments.getOrNull("SFRAX");
  // const SFRXETHDeployment = await deployments.getOrNull("SFRXETH");

  const { dexDeployer, testTokenOwner1 } = await hre.getNamedAccounts();

  return {
    // Mint amounts for the test tokens
    mintInfos: {
      DUSD: [
        {
          amount: 1e8,
          toAddress: dexDeployer,
        },
        {
          amount: 1e8 / 2,
          toAddress: testTokenOwner1,
        },
      ],
      FXS: [
        {
          amount: 1e8,
          toAddress: dexDeployer,
        },
        {
          amount: 1e8 / 2,
          toAddress: testTokenOwner1,
        },
      ],
      SFRAX: [
        {
          amount: 1e8,
          toAddress: dexDeployer,
        },
        {
          amount: 1e8 / 2,
          toAddress: testTokenOwner1,
        },
      ],
      SFRXETH: [
        {
          amount: 1e8,
          toAddress: dexDeployer,
        },
        {
          amount: 1e8 / 2,
          toAddress: testTokenOwner1,
        },
      ],
    },
    // DEX configuration
    dex: {
      weth9Address: "", // No fixed WETH9 address for localhost
      permit2Address: "", // Will be automatically deployed
      oracle: {
        cardinalityPerMinute: 30,
        baseTokenAddress: "", // No fixed base token address for localhost
        baseTokenDecimals: AAVE_ORACLE_USD_DECIMALS,
        baseTokenAmountForQuoting: ethers.parseUnits("1000", 18), // 1000 mock DUSD
        quotePeriodSeconds: 1, // Make price feeds available right away
      },
      initialPools: [
        {
          token0Address: emptyIfUndefined(WFRXETHDeployment?.address, ""),
          token1Address: emptyIfUndefined(DUSDDeployment?.address, ""),
          fee: FeeAmount.MEDIUM,
          initPrice: {
            // Initial price ratio
            amount0: 1,
            amount1: 3000,
          },
          inputToken0Amount: 10, // Initial token0 amount for adding liquidity
          gasLimits: {
            // Gas limit for the deployment and initialization
            deployPool: 5000000,
            addLiquidity: 1000000,
          },
          deadlineInSeconds: 5000, // Deadline in seconds, needs to be long for local
        },
      ],
    },
    lending: {
      mockPriceAggregatorInitialUSDPrices: {},
      providerID: 42, // arbitrary number
      reserveAssetAddresses: undefined, // No fixed reserve assets for localhost
      chainlinkAggregatorAddresses: undefined, // No fixed chainlink aggregator addresses for localhost
      flashLoanPremium: {
        total: 0.0005e4, // 0.05%
        protocol: 0.0004e4, // 0.04%
      },
      reservesConfig: {
        WFRXETH: strategyWETH,
        DUSD: strategyDUSD,
        FXS: strategyFXS,
        SFRAX: strategyYieldBearingStablecoin,
        SFRXETH: strategyETHLST,
      },
      rateStrategies: [
        rateStrategyHighLiquidityVolatile,
        rateStrategyMediumLiquidityVolatile,
        rateStrategyHighLiquidityStable,
        rateStrategyMediumLiquidityStable,
      ],
      chainlinkEthUsdAggregatorProxy: "", // No fixed chainlink aggregator proxy for localhost
    },
    liquidatorBot: {
      flashMinter: emptyIfUndefined(DUSDDeployment?.address, ""),
      dUSDAddress: emptyIfUndefined(DUSDDeployment?.address, ""),
      slippageTolerance: 500, // 5% in bps
      healthFactorThreshold: 1,
      healthFactorBatchSize: 10,
      reserveBatchSize: 10,
      profitableThresholdInUSD: 1,
      graphConfig: {
        url: "", // Not used for localhost
        batchSize: 0,
      },
    },
  };
}

/**
 * Return the value if it is not undefined or null, otherwise return the default value
 *
 * @param value - The value to check
 * @param defaultValue - The default value to return if the value is undefined or null
 * @returns The value if it is not undefined or null, otherwise the default value
 */
function emptyIfUndefined<T>(value: T | undefined | null, defaultValue: T): T {
  return value === undefined || value === null ? defaultValue : value;
}
