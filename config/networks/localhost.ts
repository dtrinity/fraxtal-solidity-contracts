import { FeeAmount } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { CURVE_CONTRACTS, POOLS } from "../../test/curve/registry";
import {
  ATOKEN_IMPL_ID,
  dUSD_A_TOKEN_WRAPPER_ID,
  INCENTIVES_PROXY_ID,
  SDUSD_DSTAKE_TOKEN_ID,
  SDUSD_REWARD_MANAGER_ID,
  SDUSD_WRAPPED_DLEND_CONVERSION_ADAPTER_ID,
} from "../../typescript/deploy-ids";
import {
  AAVE_ORACLE_USD_DECIMALS,
  ONE_PERCENT_BPS,
} from "../../utils/constants";
import { TEST_WETH9_ID } from "../../utils/dex/deploy-ids";
import {
  rateStrategyDUSD,
  rateStrategyHighLiquidityStable,
  rateStrategyHighLiquidityVolatile,
  rateStrategyMediumLiquidityStable,
  rateStrategyMediumLiquidityVolatile,
} from "../../utils/lending/rate-strategies";
import {
  strategyDUSD,
  strategyETHLST,
  strategyFXSTestnet,
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
  const _DUSDDeployment = await hre.deployments.getOrNull("DUSD");
  const dUSDDeployment = await hre.deployments.getOrNull("dUSD");
  const FXSDeployment = await hre.deployments.getOrNull("FXS");
  const SFRAXDeployment = await hre.deployments.getOrNull("SFRAX");

  const { dexDeployer, testTokenOwner1 } = await hre.getNamedAccounts();

  const dexOracleWrapperDeployment = await hre.deployments.getOrNull(
    DEX_ORACLE_WRAPPER_ID,
  );

  // Fetch dSTAKE related deployments
  const sdUSDDeployment = await hre.deployments.getOrNull(
    SDUSD_DSTAKE_TOKEN_ID,
  );
  const dUSDStaticATokenDeployment = await hre.deployments.getOrNull(
    dUSD_A_TOKEN_WRAPPER_ID,
  );
  const conversionAdapterDeployment = await hre.deployments.getOrNull(
    SDUSD_WRAPPED_DLEND_CONVERSION_ADAPTER_ID,
  );
  const _rewardManagerDeployment = await hre.deployments.getOrNull(
    SDUSD_REWARD_MANAGER_ID,
  );
  const rewardsControllerDeployment =
    await hre.deployments.getOrNull(INCENTIVES_PROXY_ID);
  const dUSDATokenDeployment = await hre.deployments.getOrNull(
    `${ATOKEN_IMPL_ID}_dUSD`,
  );

  return {
    walletAddresses: {
      governanceMultisig: dexDeployer,
    },
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
      vSFRAX: [
        {
          amount: 1e8,
          toAddress: dexDeployer,
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
          token1Address: emptyIfUndefined(dUSDDeployment?.address, ""),
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
        FXS: strategyFXSTestnet,
        SFRAX: strategyYieldBearingStablecoin,
        vSFRAX: strategyYieldBearingStablecoin, // the mock ERC4626 vault token for SFRAX
        SFRXETH: strategyETHLST,
      },
      rateStrategies: [
        rateStrategyHighLiquidityVolatile,
        rateStrategyMediumLiquidityVolatile,
        rateStrategyHighLiquidityStable,
        rateStrategyMediumLiquidityStable,
        rateStrategyDUSD,
      ],
      chainlinkEthUsdAggregatorProxy: "", // No fixed chainlink aggregator proxy for localhost
      incentivesVault: dexDeployer, // Default to the main deployer
      incentivesEmissionManager: dexDeployer, // Default to the main deployer
    },
    liquidatorBotUniswapV3: undefined,
    liquidatorBotCurve: undefined, // No Curve liquidator on localhost
    liquidatorBotOdos: undefined, // No Odos liquidator on localhost
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
    dLoop: {
      // TODO: will add later
      dUSDAddress: emptyIfUndefined(dUSDDeployment?.address, ""),
      coreVaults: {},
      depositors: {},
      withdrawers: {},
    },
    oracleAggregator: {
      hardDusdPeg: 10 ** AAVE_ORACLE_USD_DECIMALS,
      priceDecimals: AAVE_ORACLE_USD_DECIMALS,
      dUSDAddress: emptyIfUndefined(dUSDDeployment?.address, ""),
      dexOracleAssets: {
        // Note that dUSD is already hard pegged to $1, so it's not included in dexOracleAssets
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
        api3OracleWrappersWithThresholding: {},
        compositeApi3OracleWrappersWithThresholding: {},
      },
      curveOracleAssets: {
        curveApi3CompositeOracles: {},
      },
    },
    curve: {
      // Source: https://docs.curve.fi/references/deployed-contracts/#curve-router
      // Use the Curve router deployed on Ethereum mainnet
      router: "0x16C6521Dff6baB339122a0FE25a9116693265353",
    },
    odos: {
      router: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210", // Dummy address
    },
    dStables: {
      dUSD: {
        collaterals: [
          // Mock addresses for localhost testing
          "0x0000000000000000000000000000000000000001", // frxUSD mock
          "0x0000000000000000000000000000000000000008", // sfrxUSD mock
          "0x0000000000000000000000000000000000000009", // DAI mock
          "0x000000000000000000000000000000000000000A", // sDAI mock
          "0x000000000000000000000000000000000000000B", // USDe mock
          "0x000000000000000000000000000000000000000C", // sUSDe mock
          "0x000000000000000000000000000000000000000D", // USDC mock
          "0x000000000000000000000000000000000000000E", // USDT mock
          "0x000000000000000000000000000000000000000F", // crvUSD mock
          "0x0000000000000000000000000000000000000010", // scrvUSD mock
        ],
        initialFeeReceiver: dexDeployer, // governanceMultisig
        initialRedemptionFeeBps: 0.4 * ONE_PERCENT_BPS, // 0.4% default
        collateralRedemptionFees: {
          // Stablecoins: 0.4%
          ["0x0000000000000000000000000000000000000001"]: 0.4 * ONE_PERCENT_BPS, // frxUSD
          ["0x0000000000000000000000000000000000000009"]: 0.4 * ONE_PERCENT_BPS, // DAI
          ["0x000000000000000000000000000000000000000B"]: 0.4 * ONE_PERCENT_BPS, // USDe
          ["0x000000000000000000000000000000000000000D"]: 0.4 * ONE_PERCENT_BPS, // USDC
          ["0x000000000000000000000000000000000000000E"]: 0.4 * ONE_PERCENT_BPS, // USDT
          ["0x000000000000000000000000000000000000000F"]: 0.4 * ONE_PERCENT_BPS, // crvUSD
          // Yield bearing stablecoins: 0.5%
          ["0x0000000000000000000000000000000000000008"]: 0.5 * ONE_PERCENT_BPS, // sfrxUSD
          ["0x000000000000000000000000000000000000000A"]: 0.5 * ONE_PERCENT_BPS, // sDAI
          ["0x000000000000000000000000000000000000000C"]: 0.5 * ONE_PERCENT_BPS, // sUSDe
          ["0x0000000000000000000000000000000000000010"]: 0.5 * ONE_PERCENT_BPS, // scrvUSD
        },
      },
    },
    dStake:
      dUSDDeployment &&
      dUSDStaticATokenDeployment &&
      dUSDStaticATokenDeployment.address !== ""
        ? {
            sdUSD: {
              dStable: dUSDDeployment.address,
              name: "Staked dUSD",
              symbol: "sdUSD",
              initialAdmin: dexDeployer,
              initialFeeManager: dexDeployer,
              initialWithdrawalFeeBps: 0.1 * ONE_PERCENT_BPS, // 0.1% (1000 in contract terms = 10 basis points)
              adapters:
                dUSDStaticATokenDeployment &&
                dUSDStaticATokenDeployment.address !== "" &&
                conversionAdapterDeployment
                  ? [
                      {
                        vaultAsset: dUSDStaticATokenDeployment.address,
                        adapterContract: "WrappedDLendConversionAdapter",
                      },
                    ]
                  : [],
              defaultDepositVaultAsset: emptyIfUndefined(
                dUSDStaticATokenDeployment?.address,
                "",
              ),
              collateralVault: "DStakeCollateralVault_sdUSD",
              collateralExchangers: [dexDeployer],
              dLendRewardManager:
                dUSDStaticATokenDeployment &&
                dUSDATokenDeployment &&
                rewardsControllerDeployment
                  ? {
                      managedVaultAsset: dUSDStaticATokenDeployment.address,
                      dLendAssetToClaimFor: dUSDATokenDeployment.address,
                      dLendRewardsController:
                        rewardsControllerDeployment.address,
                      treasury: dexDeployer,
                      maxTreasuryFeeBps: 5 * ONE_PERCENT_BPS, // 5%
                      initialTreasuryFeeBps: 1 * ONE_PERCENT_BPS, // 1%
                      initialExchangeThreshold: ethers
                        .parseUnits("1", 6)
                        .toString(), // 1 dUSD (6 decimals)
                    }
                  : undefined,
            },
          }
        : undefined,
    vesting: sdUSDDeployment
      ? {
          name: "dBOOST sdUSD Season 1",
          symbol: "sdUSD-S1",
          dstakeToken: sdUSDDeployment.address,
          vestingPeriod: 180 * 24 * 60 * 60, // 6 months
          maxTotalSupply: ethers.parseUnits("20000000", 18).toString(), // 20M tokens
          initialOwner: dexDeployer,
          minDepositThreshold: ethers.parseUnits("250000", 18).toString(), // 250k tokens
        }
      : undefined,
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
