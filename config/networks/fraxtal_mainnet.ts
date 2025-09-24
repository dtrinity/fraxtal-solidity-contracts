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
import { AAVE_ORACLE_USD_DECIMALS, ONE_PERCENT_BPS } from "../../utils/constants";
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
  strategyFRAX,
  strategyFXB20251231,
  strategyFXB20261231,
  strategyFXB20291231,
  strategyFXB20551231,
  strategyscrvUSD,
  strategysDAI,
  strategyUSDe,
  strategyWETH,
  strategyYieldBearingStablecoin,
} from "../../utils/lending/reserves-configs";
import { Config } from "../types";
import { liquidatorBotCurve } from "./fraxtal_mainnet/liquidator-curve";
import { liquidatorBotOdos } from "./fraxtal_mainnet/liquidator-odos";
import { liquidatorBotUniswapV3 } from "./fraxtal_mainnet/liquidator-uniswap";

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
  frxUSD: {
    address: "0xfc00000000000000000000000000000000000001",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  sfrxUSD: {
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
  USDT: {
    address: "0x4d15EA9C2573ADDAeD814e48C148b5262694646A",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  // Frax Bond 20291231
  FXB20291231: {
    address: "0xf1e2b576af4c6a7ee966b14c810b772391e92153",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  wFRAX: {
    // fka FXS
    address: "0xfc00000000000000000000000000000000000002",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  scrvUSD: {
    address: "0xab94c721040b33aa8b0b4d159da9878e2a836ed0",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  crvUSD: {
    address: "0xb102f7efa0d5de071a8d37b3548e1c7cb148caf3",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  FXB20551231: {
    // Frax Bond 20551231
    address: "0xc38173d34afaea88bc482813b3cd267bc8a1ea83",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  FXB20251231: {
    // Frax Bond 20251231
    address: "0xaca9a33698cf96413a40a4eb9e87906ff40fc6ca",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  FXB20261231: {
    // Frax Bond 20261231
    address: "0x8e9C334afc76106F08E0383907F4Fca9bB10BA3e",
    priceAggregator: "", // Fall back to OracleAggregator
  },
};

/**
 * Get the configuration for the network
 *
 * @param _hre - Hardhat Runtime Environment
 * @returns The configuration for the network
 */
export async function getConfig(_hre: HardhatRuntimeEnvironment): Promise<Config> {
  // Fetch deployed dSTAKE token for sdUSD (may be undefined prior to deployment)
  const _sdUSDDeployment = await _hre.deployments.getOrNull(SDUSD_DSTAKE_TOKEN_ID);

  // Fetch deployed StaticATokenLM wrapper for dUSD
  const dUSDStaticATokenDeployment = await _hre.deployments.getOrNull(dUSD_A_TOKEN_WRAPPER_ID);

  // Fetch deployed conversion adapter for sdUSD
  const conversionAdapterDeployment = await _hre.deployments.getOrNull(SDUSD_WRAPPED_DLEND_CONVERSION_ADAPTER_ID);

  // Fetch deployed reward manager for sdUSD
  const _rewardManagerDeployment = await _hre.deployments.getOrNull(SDUSD_REWARD_MANAGER_ID);

  // Fetch dLEND deployments for reward manager config
  const rewardsControllerDeployment = await _hre.deployments.getOrNull(INCENTIVES_PROXY_ID);

  // Get the dUSD aToken deployment by constructing its ID
  const dUSDATokenDeployment = await _hre.deployments.getOrNull(`${ATOKEN_IMPL_ID}_dUSD`);

  // Safe configuration for governance multisig
  const safeOwners = [
    "0xDC672ba6e55B71b39FA5423D42B88E7aDF9d24A4",
    "0x4B58fF1AAE6AdD7465A5584eBCaeb876ec8f21FD",
    "0x9E0c8376940aBE845A89b7304147a95c72644f59",
  ];
  const safeThreshold = 2; // 2 of 3 multisig

  return {
    // Safe configuration for governance multisig
    safeConfig: {
      safeAddress: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // governance multisig Safe
      owners: safeOwners, // Optional: populate with actual owner addresses for verification
      threshold: safeThreshold, // Expected threshold (will be verified at runtime)
      chainId: 252, // Fraxtal mainnet chain ID
      rpcUrl: "https://rpc.frax.com",
    },
    walletAddresses: {
      governanceMultisig: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // Safe multisig
    },
    mintInfos: undefined, // No minting on mainnet
    // dex: {
    //   weth9Address: TOKEN_INFO.wFRAX.address,
    //   permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    //   oracle: {
    //     // Fraxtal produces blocks every 2 seconds, 60 / 2 = 30
    //     cardinalityPerMinute: 30,
    //     baseTokenAddress: TOKEN_INFO.dUSD.address,
    //     baseTokenDecimals: AAVE_ORACLE_USD_DECIMALS,
    //     baseTokenAmountForQuoting: ethers.parseUnits("1000", 6), // 1000 DUSD
    //     quotePeriodSeconds: 300, // 5 min to balance responsiveness with attack expense
    //   },
    //   initialPools: [
    //     // Need wfrxETH/DUSD pool to bootstrap UI
    //     {
    //       token0Address: TOKEN_INFO.wfrxETH.address,
    //       token1Address: TOKEN_INFO.dUSD.address,
    //       fee: FeeAmount.MEDIUM, // Fee 30 bps
    //       initPrice: {
    //         // Initial price ratio
    //         amount0: 1,
    //         amount1: 3800,
    //       },
    //       inputToken0Amount: 0.001, // Initial token0 amount for adding liquidity
    //       gasLimits: {
    //         // Gas limit for the deployment and initialization
    //         deployPool: 5000000,
    //         addLiquidity: 1000000,
    //       },
    //       deadlineInSeconds: 600000, // Deadline in seconds
    //     },
    //   ],
    // },
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
        sfrxUSD: strategyYieldBearingStablecoin,
        sUSDe: strategyYieldBearingStablecoin,
        FXB20291231: strategyFXB20291231,
        FRAX: strategyFRAX, // fka FXS, now WFRAX
        scrvUSD: strategyscrvUSD,
        FXB20551231: strategyFXB20551231,
        FXB20251231: strategyFXB20251231,
        sDAI: strategysDAI,
        USDe: strategyUSDe,
        FXB20261231: strategyFXB20261231,
      },
      // No stable rate borrowing, feature is disabled
      rateStrategies: [
        rateStrategyHighLiquidityVolatile,
        rateStrategyMediumLiquidityVolatile,
        rateStrategyHighLiquidityStable,
        rateStrategyMediumLiquidityStable,
        rateStrategyDUSD,
      ],
      // ref: https://docs.redstone.finance/docs/smart-contract-devs/price-feeds
      chainlinkEthUsdAggregatorProxy: "0x89e60b56efD70a1D4FBBaE947bC33cae41e37A72", // Redstone
      incentivesVault: "0x674679896A8Efd4b0BCF59F5503A3d6807172791", // Safe on Fraxtal
      incentivesEmissionManager: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // Gov Admin
    },
    liquidatorBotUniswapV3: liquidatorBotUniswapV3,
    liquidatorBotCurve: liquidatorBotCurve,
    liquidatorBotOdos: liquidatorBotOdos,
    dusd: {
      address: TOKEN_INFO.dUSD.address,
      amoVaults: {
        curveStableSwapNG: {
          pool: "0x9CA648D2f51098941688Db9a0beb1DadC2D1B357", // frxUSD/dUSD pool
          router: "0x9f2Fa7709B30c75047980a0d70A106728f0Ef2db",
        },
      },
    },
    dLoop: {
      dUSDAddress: TOKEN_INFO.dUSD.address,
      // TODO: will add later
      coreVaults: {},
      depositors: {},
      withdrawers: {},
    },
    oracleAggregator: {
      hardDusdPeg: 10 ** AAVE_ORACLE_USD_DECIMALS,
      priceDecimals: AAVE_ORACLE_USD_DECIMALS,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      dexOracleAssets: {},
      api3OracleAssets: {
        plainApi3OracleWrappers: {
          [TOKEN_INFO.wfrxETH.address]: "0xC93Da088b0c78dE892f523db0eECb051Cb628991", // ETH/USD dTrinity OEV
        },
        api3OracleWrappersWithThresholding: {
          [TOKEN_INFO.frxUSD.address]: {
            proxy: "0x4d66E060d24A1bb2983da9781f017258A439CBBb", // frxUSD/USD dTrinity OEV
            lowerThreshold: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.DAI.address]: {
            proxy: "0x99Cace7CbBAe9c619354579B893dB5695ee22A2c", // DAI/USD dTrinity OEV
            lowerThreshold: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.USDe.address]: {
            proxy: "0xF3F5e6358251Fd2115424Ed1ADa9c9BED417EdaB", // USDe/USD dTrinity OEV
            lowerThreshold: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.USDC.address]: {
            proxy: "0x5A27949E9C4BE327d45eE443d6672d1431597BEd", // USDC/USD dTrinity OEV
            lowerThreshold: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.USDT.address]: {
            proxy: "0x4eadC6ee74b7Ceb09A4ad90a33eA2915fbefcf76", // USDT/USD (generic, not dTrinity OEV)
            lowerThreshold: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.wFRAX.address]: {
            proxy: "0x7e5E61539B89522E36a5a97A265Ab3cA5A420d20", // FXS/USD (generic, not dTrinity OEV, note FXS hasn't been renamed yet)
            // No thresholding
            lowerThreshold: 0n,
            fixedPrice: 0n,
          },
          [TOKEN_INFO.crvUSD.address]: {
            proxy: "0x21234f61bFc55a586D7c28CC1776da35f9936246", // crvUSD/USD (generic, not dTrinity OEV)
            lowerThreshold: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPrice: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
        },
        compositeApi3OracleWrappersWithThresholding: {
          [TOKEN_INFO.sfrxETH.address]: {
            feedAsset: TOKEN_INFO.sfrxETH.address,
            proxy1: "0xF14741dD62af0fE80A54F1784AD6ab707cd18707", // sfrxETH/frxETH dTrinity OEV
            proxy2: "0xC93Da088b0c78dE892f523db0eECb051Cb628991", // ETH/USD dTrinity OEV
            // No thresholdling
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 0n,
            fixedPriceInBase2: 0n,
          },
          [TOKEN_INFO.sfrxUSD.address]: {
            feedAsset: TOKEN_INFO.sfrxUSD.address,
            proxy1: "0xeBC6A39522Af1706cF7F37C55C098282b844ab78", // sfrxUSD/frxUSD dTrinity OEV
            proxy2: "0x4d66E060d24A1bb2983da9781f017258A439CBBb", // frxUSD/USD dTrinity OEV
            // Don't allow FRAX to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.sDAI.address]: {
            feedAsset: TOKEN_INFO.sDAI.address,
            proxy1: "0xaCaD32f030Af764ab1B0Bcc227FFbCb217dDf469", // sDAI/DAI dTrinity OEV
            proxy2: "0x99Cace7CbBAe9c619354579B893dB5695ee22A2c", // DAI/USD dTrinity OEV
            // Don't allow DAI to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.sUSDe.address]: {
            feedAsset: TOKEN_INFO.sUSDe.address,
            proxy1: "0xa925A7c304b96ea0ae763C73badBD5eeE74dd7ac", // sUSDe/USDe dTrinity OEV
            proxy2: "0xF3F5e6358251Fd2115424Ed1ADa9c9BED417EdaB", // USDe/USD dTrinity OEV
            // Don't allow USDe to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
          [TOKEN_INFO.scrvUSD.address]: {
            feedAsset: TOKEN_INFO.scrvUSD.address,
            proxy1: "0x029c150a79526bEE6D3Db1b10C07C4CfA6b12485", // scrvUSD/crvUSD dTrinity OEV
            proxy2: "0x21234f61bFc55a586D7c28CC1776da35f9936246", // crvUSD/USD (generic, not dTrinity OEV)
            // Don't allow scrvUSD to go above $1
            lowerThresholdInBase1: 0n,
            fixedPriceInBase1: 0n,
            lowerThresholdInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            fixedPriceInBase2: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          },
        },
      },
      curveOracleAssets: {
        curveApi3CompositeOracles: {
          [TOKEN_INFO.FXB20291231.address]: {
            pool: "0xee454138083b9b9714cac3c7cf12560248d76d6b", // frxUSD/FXB20291231 pool
            compositeAPI3Feed: {
              api3Asset: TOKEN_INFO.frxUSD.address,
              api3Proxy: "0x4d66E060d24A1bb2983da9781f017258A439CBBb", // frxUSD/USD dTrinity OEV
              api3LowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            },
          },
          [TOKEN_INFO.FXB20251231.address]: {
            pool: "0x63d64a76c2d616676cbac3068d3c6548f8485314", // frxUSD/FXB20251231 pool
            compositeAPI3Feed: {
              api3Asset: TOKEN_INFO.frxUSD.address,
              api3Proxy: "0x4d66E060d24A1bb2983da9781f017258A439CBBb", // frxUSD/USD dTrinity OEV
              api3LowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            },
          },
          [TOKEN_INFO.FXB20551231.address]: {
            pool: "0x4cfc391d75c43cf1bdb368e8bf680aed1228df39", // frxUSD/FXB20551231 pool
            compositeAPI3Feed: {
              api3Asset: TOKEN_INFO.frxUSD.address,
              api3Proxy: "0x4d66E060d24A1bb2983da9781f017258A439CBBb", // frxUSD/USD dTrinity OEV
              api3LowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            },
          },
          [TOKEN_INFO.FXB20261231.address]: {
            pool: "0xbC3705b2bfD42d38e8FA2c8EFDC3Fdda645C3b2a", // frxUSD/FXB20261231 pool
            compositeAPI3Feed: {
              api3Asset: TOKEN_INFO.frxUSD.address,
              api3Proxy: "0x4d66E060d24A1bb2983da9781f017258A439CBBb", // frxUSD/USD dTrinity OEV
              api3LowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            },
          },
        },
      },
    },
    curve: {
      router: "0x9f2Fa7709B30c75047980a0d70A106728f0Ef2db",
      tools: {
        httpServiceHost: "http://localhost:3000",
      },
    },
    odos: {
      router: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210",
    },
    dStake: {
      sdUSD: {
        dStable: TOKEN_INFO.dUSD.address,
        name: "Staked dUSD",
        symbol: "sdUSD",
        initialAdmin: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // governanceMultisig
        initialFeeManager: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // governanceMultisig
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
        collateralExchangers: ["0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9"], // governance multisig
        dLendRewardManager:
          dUSDStaticATokenDeployment && dUSDATokenDeployment && rewardsControllerDeployment
            ? {
                managedVaultAsset: dUSDStaticATokenDeployment.address, // StaticATokenLM wrapper
                dLendAssetToClaimFor: dUSDATokenDeployment.address, // dLEND aToken for dUSD
                dLendRewardsController: rewardsControllerDeployment.address, // RewardsController proxy
                treasury: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // governance multisig
                maxTreasuryFeeBps: 20 * ONE_PERCENT_BPS, // 20%
                initialTreasuryFeeBps: 0 * ONE_PERCENT_BPS, // 0%
                initialExchangeThreshold: ethers.parseUnits("100", 6).toString(), // 100 dUSD (6 decimals)
              }
            : undefined,
      },
    },
    dStables: {
      dUSD: {
        collaterals: [
          TOKEN_INFO.frxUSD.address, // 0xfc00000000000000000000000000000000000001
          TOKEN_INFO.sfrxUSD.address, // 0xfc00000000000000000000000000000000000008
          TOKEN_INFO.DAI.address, // 0xf6a011fac307f55cd4ba8e43b8b93f39808ddaa9
          TOKEN_INFO.sDAI.address, // 0x09eAdcBAa812A4C076c3a6cDe765DC4a22E0d775
          TOKEN_INFO.USDe.address, // 0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34
          TOKEN_INFO.sUSDe.address, // 0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2
          TOKEN_INFO.USDC.address, // 0xDcc0F2D8F90FDe85b10aC1c8Ab57dc0AE946A543
          TOKEN_INFO.USDT.address, // 0x4d15EA9C2573ADDAeD814e48C148b5262694646A
          TOKEN_INFO.crvUSD.address, // 0xb102f7efa0d5de071a8d37b3548e1c7cb148caf3
          TOKEN_INFO.scrvUSD.address, // 0xab94c721040b33aa8b0b4d159da9878e2a836ed0
        ],
        initialFeeReceiver: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // governanceMultisig
        initialRedemptionFeeBps: 0.4 * ONE_PERCENT_BPS, // 0.4% default
        collateralRedemptionFees: {
          // Stablecoins: 0.4%
          [TOKEN_INFO.frxUSD.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.DAI.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.USDe.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.USDC.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.USDT.address]: 0.4 * ONE_PERCENT_BPS,
          [TOKEN_INFO.crvUSD.address]: 0.4 * ONE_PERCENT_BPS,
          // Yield bearing stablecoins: 0.5%
          [TOKEN_INFO.sfrxUSD.address]: 0.5 * ONE_PERCENT_BPS,
          [TOKEN_INFO.sDAI.address]: 0.5 * ONE_PERCENT_BPS,
          [TOKEN_INFO.sUSDe.address]: 0.5 * ONE_PERCENT_BPS,
          [TOKEN_INFO.scrvUSD.address]: 0.5 * ONE_PERCENT_BPS,
        },
      },
    },
    // Launching dBOOST later
    // vesting: {
    //   name: "dBOOST sdUSD Season 1",
    //   symbol: "sdUSD-S1",
    //   dstakeToken: _emptyStringIfUndefined(_sdUSDDeployment?.address),
    //   vestingPeriod: 180 * 24 * 60 * 60, // 6 months
    //   maxTotalSupply: ethers.parseUnits("20000000", 6).toString(), // 20M tokens
    //   initialOwner: "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9", // governanceMultisig
    //   minDepositThreshold: ethers.parseUnits("250000", 6).toString(), // 250k tokens
    // },
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
 * Return an empty string if the value is undefined
 *
 * @param value - The value to check
 * @returns An empty string if the value is undefined, otherwise the value itself
 */
function _emptyStringIfUndefined(value: string | undefined): string {
  return value || "";
}
