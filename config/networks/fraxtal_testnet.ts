import { FeeAmount } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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
  ONE_BPS_UNIT,
  ONE_PERCENT_BPS,
} from "../../utils/constants";
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
import { API3_PRICE_DECIMALS } from "../../utils/oracle_aggregator/constants";
import { Config } from "../types";
import {
  CURVE_POOLS,
  CURVE_SWAP_ROUTER_ADDRESS,
  liquidatorBotCurve,
} from "./fraxtal_testnet/liquidator-curve";

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
 * @param hre - Hardhat Runtime Environment
 * @returns The configuration for the network
 */
export async function getConfig(
  hre: HardhatRuntimeEnvironment,
): Promise<Config> {
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

  const { lendingDeployer } = await hre.getNamedAccounts();

  return {
    walletAddresses: {
      governanceMultisig: (await hre.getNamedAccounts()).lendingDeployer,
    },
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
        FXS: strategyFXSTestnet,
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
        rateStrategyDUSD,
      ],
      chainlinkEthUsdAggregatorProxy: ETH_CHAINLINK_ORACLE_ADDRESS, // Required by Aave UI Helpers
      // TODO: Add the incentives vault and emission manager addresses
      incentivesVault: (await hre.getNamedAccounts()).lendingDeployer,
      incentivesEmissionManager: (await hre.getNamedAccounts()).lendingDeployer,
    },
    liquidatorBotUniswapV3: undefined, // No UniswapV3 liquidator on testnet.
    liquidatorBotCurve: liquidatorBotCurve,
    dusd: {
      address: TOKEN_INFO.dUSD.address,
      amoVaults: {
        // uniswapV3: {
        //   pool: "0x442be8bcd2e22be81f1dad142296eb4d9032a4dd", // DUSD/SFRAX pool (largest TVL pool on dSwap Fraxtal Testnet)
        //   nftPositionManager: "0x7c5f589eEd2b2c85b3AC623B66781Ddd58E30234",
        //   router: "0x86fa24508003ee40FBC34385047b665c0Ec9DC55",
        // },
        curveStableSwapNG: {
          pool: "0x1FCa361032eE8123cbeB82Ae2dfA169e4d56fcd0",
          router: "0xF66c3Ef85BceafaEcE9171E25Eee2972b10e1958",
        },
      },
    },
    dLoop: {
      dUSDAddress: TOKEN_INFO.dUSD.address,
      coreVaults: {
        "3x_sFRAX_DUSD": {
          venue: "dlend",
          name: "Leveraged sFRAX-DUSD Vault",
          symbol: "FRAX-DUSD-3x",
          underlyingAsset: TOKEN_INFO.sFRAX.address,
          dStable: TOKEN_INFO.dUSD.address,
          targetLeverageBps: 300 * 100 * ONE_BPS_UNIT, // 300% leverage, meaning 3x leverage
          lowerBoundTargetLeverageBps: 200 * 100 * ONE_BPS_UNIT, // 200% leverage, meaning 2x leverage
          upperBoundTargetLeverageBps: 400 * 100 * ONE_BPS_UNIT, // 400% leverage, meaning 4x leverage
          maxSubsidyBps: 2 * 100 * ONE_BPS_UNIT, // 2% subsidy
          extraParams: {},
        },
      },
      depositors: {
        uniswapV3: {
          defaultDusdToUnderlyingSwapPath: {
            tokenAddressesPath: [
              TOKEN_INFO.dUSD.address,
              TOKEN_INFO.sFRAX.address,
            ],
            poolFeeSchemaPath: [FeeAmount.MEDIUM],
          },
          defaultUnderlyingToDusdSwapPath: {
            tokenAddressesPath: [
              TOKEN_INFO.sFRAX.address,
              TOKEN_INFO.dUSD.address,
            ],
            poolFeeSchemaPath: [FeeAmount.MEDIUM],
          },
        },
        curve: {
          swapRouter: CURVE_SWAP_ROUTER_ADDRESS,
          defaultSwapParamsList: [
            // dUSD -> sFRAX (and sFRAX -> dUSD)
            {
              inputToken: TOKEN_INFO.dUSD.address,
              outputToken: TOKEN_INFO.sFRAX.address,
              swapExtraParams: {
                route: [
                  TOKEN_INFO.dUSD.address,
                  CURVE_POOLS.stableswapng.dUSD_FRAX.address,
                  TOKEN_INFO.FRAX.address,
                  CURVE_POOLS.stableswapng.FRAX_sFRAX.address,
                  TOKEN_INFO.sFRAX.address,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                ],
                swapParams: [
                  [0, 1, 1, 2],
                  [0, 1, 1, 2],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                ],
                swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
              },
              reverseSwapExtraParams: {
                route: [
                  TOKEN_INFO.sFRAX.address,
                  CURVE_POOLS.stableswapng.FRAX_sFRAX.address,
                  TOKEN_INFO.FRAX.address,
                  CURVE_POOLS.stableswapng.dUSD_FRAX.address,
                  TOKEN_INFO.dUSD.address,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                ],
                swapParams: [
                  [1, 0, 1, 2],
                  [1, 0, 1, 2],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                ],
                swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
              },
            },
          ],
        },
        odos: {
          router: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210", // Dummy address
        },
      },
      withdrawers: {
        uniswapV3: {
          defaultDusdToUnderlyingSwapPath: {
            tokenAddressesPath: [
              TOKEN_INFO.dUSD.address,
              TOKEN_INFO.sFRAX.address,
            ],
            poolFeeSchemaPath: [FeeAmount.MEDIUM],
          },
          defaultUnderlyingToDusdSwapPath: {
            tokenAddressesPath: [
              TOKEN_INFO.sFRAX.address,
              TOKEN_INFO.dUSD.address,
            ],
            poolFeeSchemaPath: [FeeAmount.MEDIUM],
          },
        },
        curve: {
          swapRouter: CURVE_SWAP_ROUTER_ADDRESS,
          defaultSwapParamsList: [
            // dUSD -> sFRAX (and sFRAX -> dUSD)
            {
              inputToken: TOKEN_INFO.dUSD.address,
              outputToken: TOKEN_INFO.sFRAX.address,
              swapExtraParams: {
                route: [
                  TOKEN_INFO.dUSD.address,
                  CURVE_POOLS.stableswapng.dUSD_FRAX.address,
                  TOKEN_INFO.FRAX.address,
                  CURVE_POOLS.stableswapng.FRAX_sFRAX.address,
                  TOKEN_INFO.sFRAX.address,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                ],
                swapParams: [
                  [0, 1, 1, 2],
                  [0, 1, 1, 2],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                ],
                swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
              },
              reverseSwapExtraParams: {
                route: [
                  TOKEN_INFO.sFRAX.address,
                  CURVE_POOLS.stableswapng.FRAX_sFRAX.address,
                  TOKEN_INFO.FRAX.address,
                  CURVE_POOLS.stableswapng.dUSD_FRAX.address,
                  TOKEN_INFO.dUSD.address,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                  ethers.ZeroAddress,
                ],
                swapParams: [
                  [1, 0, 1, 2],
                  [1, 0, 1, 2],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                  [0, 0, 0, 0],
                ],
                swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
              },
            },
          ],
        },
        odos: {
          router: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210", // Dummy address
        },
      },
    },
    oracleAggregator: {
      hardDusdPeg: 10 ** AAVE_ORACLE_USD_DECIMALS,
      priceDecimals: AAVE_ORACLE_USD_DECIMALS,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      dexOracleAssets: {
        [TOKEN_INFO.wfrxETH.address]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
        [TOKEN_INFO.FXS.address]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
        [TOKEN_INFO.sfrxETH.address]: emptyIfUndefined(
          dexOracleWrapperDeployment?.address,
          "",
        ),
      },
      api3OracleAssets: {
        plainApi3OracleWrappers: {
          [TOKEN_INFO.DAI.address]:
            "0x881c60d9C000a954E87B6e24700998EF89501a8a",
          [TOKEN_INFO.USDe.address]:
            "0x45C3e10E3a9A4DDB35Edba2c03610CFd4A83fcE0",
        },
        api3OracleWrappersWithThresholding: {
          [TOKEN_INFO.FRAX.address]: {
            proxy: "0x6Aae0Db059357cD59a451b8486EFB1b2Af141785", // FRAX/USD
            lowerThreshold: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
        },
        compositeApi3OracleWrappersWithThresholding: {
          [TOKEN_INFO.sFRAX.address]: {
            feedAsset: TOKEN_INFO.sFRAX.address,
            proxy1: "0x4D1fE37682FD235d0861Daf74573db37d1d0f676", // sFRAX/FRAX
            proxy2: "0x6Aae0Db059357cD59a451b8486EFB1b2Af141785", // FRAX/USD
            // Don't allow FRAX to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
          [TOKEN_INFO.sDAI.address]: {
            feedAsset: TOKEN_INFO.sDAI.address,
            proxy1: "0x7dEBBD60b21177E7686C3BA9a99f58D5838BF7bb", // sDAI/DAI
            proxy2: "0x881c60d9C000a954E87B6e24700998EF89501a8a", // DAI/USD
            // Don't allow DAI to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
          [TOKEN_INFO.sUSDe.address]: {
            feedAsset: TOKEN_INFO.sUSDe.address,
            proxy1: "0xC2f626B858ab6F6cAcc25670b6996323F8656E88", // sUSDe/USDe
            proxy2: "0x45C3e10E3a9A4DDB35Edba2c03610CFd4A83fcE0", // USDe/USD
            // Don't allow USDe to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(API3_PRICE_DECIMALS),
          },
        },
      },
      curveOracleAssets: {
        curveApi3CompositeOracles: {},
      },
    },
    curve: {
      router: "0xF66c3Ef85BceafaEcE9171E25Eee2972b10e1958",
      tools: {
        httpServiceHost: "http://localhost:3000",
      },
    },
    odos: {
      router: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210", // Dummy address
    },
    dStables: {
      dUSD: {
        collaterals: [
          TOKEN_INFO.FRAX.address, // frxUSD equivalent on testnet
          TOKEN_INFO.sFRAX.address, // sfrxUSD equivalent on testnet
          TOKEN_INFO.DAI.address,
          TOKEN_INFO.sDAI.address,
          TOKEN_INFO.USDe.address,
          TOKEN_INFO.sUSDe.address,
          // Note: USDC, USDT, crvUSD, scrvUSD not available on testnet
        ],
        initialFeeReceiver: (await hre.getNamedAccounts()).lendingDeployer, // governanceMultisig
        initialRedemptionFeeBps: 0.4 * ONE_PERCENT_BPS, // 0.4% default
        collateralRedemptionFees: {
          // Stablecoins: 0.4%
          [TOKEN_INFO.FRAX.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.DAI.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.USDe.address]: 0.4 * ONE_PERCENT_BPS,
          // Yield bearing stablecoins: 0.5%
          [TOKEN_INFO.sFRAX.address]: 0.5 * ONE_PERCENT_BPS,
          [TOKEN_INFO.sDAI.address]: 0.5 * ONE_PERCENT_BPS,
          [TOKEN_INFO.sUSDe.address]: 0.5 * ONE_PERCENT_BPS,
        },
      },
    },
    dStake: {
      sdUSD: {
        dStable: TOKEN_INFO.dUSD.address,
        name: "Staked dUSD",
        symbol: "sdUSD",
        initialAdmin: lendingDeployer,
        initialFeeManager: lendingDeployer,
        initialWithdrawalFeeBps: 0.1 * ONE_PERCENT_BPS, // 0.1%
        adapters:
          dUSDStaticATokenDeployment && conversionAdapterDeployment
            ? [
                {
                  vaultAsset: dUSDStaticATokenDeployment.address,
                  adapterContract: "WrappedDLendConversionAdapter",
                },
              ]
            : [],
        defaultDepositVaultAsset: dUSDStaticATokenDeployment?.address || "",
        collateralVault: "DStakeCollateralVault_sdUSD",
        collateralExchangers: [lendingDeployer],
        dLendRewardManager:
          dUSDStaticATokenDeployment &&
          dUSDATokenDeployment &&
          rewardsControllerDeployment
            ? {
                managedVaultAsset: dUSDStaticATokenDeployment.address,
                dLendAssetToClaimFor: dUSDATokenDeployment.address,
                dLendRewardsController: rewardsControllerDeployment.address,
                treasury: lendingDeployer,
                maxTreasuryFeeBps: 5 * ONE_PERCENT_BPS, // 5%
                initialTreasuryFeeBps: 1 * ONE_PERCENT_BPS, // 1%
                initialExchangeThreshold: ethers.parseUnits("1", 6).toString(), // 1 dUSD (6 decimals)
              }
            : undefined,
      },
    },
    vesting: {
      name: "dBOOST sdUSD Season 1",
      symbol: "sdUSD-S1",
      dstakeToken: sdUSDDeployment?.address || "",
      vestingPeriod: 180 * 24 * 60 * 60, // 6 months
      maxTotalSupply: ethers.parseUnits("20000000", 6).toString(), // 20M tokens
      initialOwner: lendingDeployer,
      minDepositThreshold: ethers.parseUnits("25", 6).toString(), // 25 tokens for testnet
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
