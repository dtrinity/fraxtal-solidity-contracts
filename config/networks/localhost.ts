import { FeeAmount } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { CURVE_CONTRACTS, POOLS } from "../../test/curve/registry";
import { AAVE_ORACLE_USD_DECIMALS, ONE_BPS_UNIT } from "../../utils/constants";
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
import { DEX_ORACLE_WRAPPER_ID } from "../../utils/oracle/deploy-ids";
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
  // TODO: should be changed to dUSD
  // We currently use the pre-minted test DUSD token in liquidity pools
  // Whereas dUSD starts at 0 supply, DUSD is pre-minted. In order to change to
  // using dUSD we also need to migrate away from using dSWAP with the old DUSD
  const DUSDDeployment = await hre.deployments.getOrNull("DUSD");
  const dUSDDeployment = await hre.deployments.getOrNull("dUSD");
  const FXSDeployment = await hre.deployments.getOrNull("FXS");
  const SFRAXDeployment = await hre.deployments.getOrNull("SFRAX");

  const { dexDeployer, testTokenOwner1 } = await hre.getNamedAccounts();

  const dexOracleWrapperDeployment = await hre.deployments.getOrNull(
    DEX_ORACLE_WRAPPER_ID,
  );

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
      incentivesVault: dexDeployer, // Default to the main deployer
      incentivesEmissionManager: dexDeployer, // Default to the main deployer
    },
    liquidatorBot: {
      flashMinter: emptyIfUndefined(DUSDDeployment?.address, ""),
      dUSDAddress: emptyIfUndefined(DUSDDeployment?.address, ""),
      slippageTolerance: 500, // 5% in bps
      healthFactorThreshold: 1,
      healthFactorBatchSize: 10,
      reserveBatchSize: 10,
      profitableThresholdInUSD: 1,
      liquidatingBatchSize: 200,
      graphConfig: {
        url: "", // Not used for localhost
        batchSize: 0,
      },
    },
    dusd: {
      address: emptyIfUndefined(dUSDDeployment?.address, ""),
      amoVaults: {
        curveStableSwapNG: {
          // Note that these values are only valid when forking on local_ethereum
          pool: POOLS.stableswapng.USDe_USDC.address,
          router: CURVE_CONTRACTS.router,
        },
      },
    },
    dLoopUniswapV3: {
      vaults: [
        {
          // The sFRAX-DUSD (HIGH) pool is initialized in test/ecosystem/fixtures.ts
          dusdAddress: emptyIfUndefined(DUSDDeployment?.address, ""),
          underlyingAssetAddress: emptyIfUndefined(
            SFRAXDeployment?.address,
            "",
          ),
          defaultDusdToUnderlyingSwapPath: {
            tokenAddressesPath: [
              emptyIfUndefined(DUSDDeployment?.address, ""),
              emptyIfUndefined(SFRAXDeployment?.address, ""),
            ],
            poolFeeSchemaPath: [FeeAmount.HIGH],
          },
          defaultUnderlyingToDusdSwapPath: {
            tokenAddressesPath: [
              emptyIfUndefined(SFRAXDeployment?.address, ""),
              emptyIfUndefined(DUSDDeployment?.address, ""),
            ],
            poolFeeSchemaPath: [FeeAmount.HIGH],
          },
          targetLeverageBps: 300 * 100 * ONE_BPS_UNIT, // 300% leverage, meaning 3x leverage
          swapSlippageTolerance: 5 * 100 * ONE_BPS_UNIT, // 5% slippage tolerance
          maxSubsidyBps: 2 * 100 * ONE_BPS_UNIT, // 2% subsidy, meaning 1x leverage
        },
      ],
    },
    dLoopCurve: undefined, // No dLoopCurve configuration for localhost
    // dLoopCurve: {
    //   dUSDAddress: TOKENS.USDe.address,
    //   vaults: [
    //     {
    //       underlyingAssetAddress: TOKENS.sDAI.address,
    //       swapRouter: CURVE_CONTRACTS.router,
    //       defaultDusdToUnderlyingSwapExtraParams: {
    //         route: [
    //           TOKENS.USDe.address,
    //           POOLS.stableswapng.USDe_DAI.address,
    //           TOKENS.sDAI.address,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //         ],
    //         swapParams: [
    //           [0, 1, 1, 2],
    //           [0, 0, 0, 0],
    //           [0, 0, 0, 0],
    //           [0, 0, 0, 0],
    //           [0, 0, 0, 0],
    //         ],
    //         swapSlippageBufferBps: 5000, // 50% slippage buffer
    //       },
    //       defaultUnderlyingToDusdSwapExtraParams: {
    //         route: [
    //           TOKENS.sDAI.address,
    //           POOLS.stableswapng.USDe_DAI.address,
    //           TOKENS.USDe.address,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //           ethers.ZeroAddress,
    //         ],
    //         swapParams: [
    //           [0, 1, 1, 2],
    //           [0, 0, 0, 0],
    //           [0, 0, 0, 0],
    //           [0, 0, 0, 0],
    //           [0, 0, 0, 0],
    //         ],
    //         swapSlippageBufferBps: 5000, // 50% slippage buffer
    //       },
    //       targetLeverageBps: 300 * 100 * ONE_BPS_UNIT, // 300% leverage, meaning 3x leverage
    //       swapSlippageTolerance: 20 * 100 * ONE_BPS_UNIT, // 20% slippage tolerance
    //       maxSubsidyBps: 2 * 100 * ONE_BPS_UNIT, // 2% subsidy, meaning 1x leverage
    //       maxSlippageSurplusSwapBps: 20 * 100 * ONE_BPS_UNIT, // 20% slippage surplus swap
    //     },
    //   ],
    // },
    oracleAggregator: {
      hardDusdPeg: 10 ** AAVE_ORACLE_USD_DECIMALS,
      priceDecimals: AAVE_ORACLE_USD_DECIMALS,
      dUSDAddress: emptyIfUndefined(dUSDDeployment?.address, ""),
      dexOracleAssets: {
        // TODO remove once we deprecate DUSD in favor of dUSD
        // Note that dUSD is already hard pegged to $1
        [emptyIfUndefined(DUSDDeployment?.address, "")]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
        [emptyIfUndefined(SFRAXDeployment?.address, "")]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
        [emptyIfUndefined(WFRXETHDeployment?.address, "")]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
        [emptyIfUndefined(FXSDeployment?.address, "")]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
      },
      api3OracleAssets: {
        plainApi3OracleWrappers: {},
        compositeApi3OracleWrappersWithThresholding: {},
      },
    },
    curve: {
      // Source: https://docs.curve.fi/references/deployed-contracts/#curve-router
      // Use the Curve router deployed on Ethereum mainnet
      router: "0x16C6521Dff6baB339122a0FE25a9116693265353",
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
