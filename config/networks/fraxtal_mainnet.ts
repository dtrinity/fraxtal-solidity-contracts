import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { AAVE_ORACLE_USD_DECIMALS, ONE_BPS_UNIT } from "../../utils/constants";
import {
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
  strategyFXB20291231,
  strategyFXB20551231,
  strategyscrvUSD,
  strategysDAI,
  strategyUSDe,
  strategyWETH,
  strategyYieldBearingStablecoin,
} from "../../utils/lending/reserves-configs";
import { Config } from "../types";

export const CURVE_SWAP_ROUTER_ADDRESS =
  "0x9f2Fa7709B30c75047980a0d70A106728f0Ef2db";

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
  FRAX: {
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
    mintInfos: undefined, // No minting on mainnet
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
        sfrxUSD: strategyYieldBearingStablecoin,
        sUSDe: strategyYieldBearingStablecoin,
        FXB20291231: strategyFXB20291231,
        FRAX: strategyFRAX,
        scrvUSD: strategyscrvUSD,
        FXB20551231: strategyFXB20551231,
        FXB20251231: strategyFXB20251231,
        sDAI: strategysDAI,
        USDe: strategyUSDe,
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
    liquidatorBotUniswapV3: undefined, // No UniswapV3 liquidator on mainnet
    liquidatorBotCurve: {
      flashMinter: TOKEN_INFO.dUSD.address,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      slippageTolerance: 50 * 100 * ONE_BPS_UNIT, // 50% slippage tolerance
      healthFactorThreshold: 1,
      healthFactorBatchSize: 5,
      reserveBatchSize: 5,
      profitableThresholdInUSD: 0,
      liquidatingBatchSize: 200,
      graphConfig: {
        url: "https://graph-node.dtrinity.org/subgraphs/name/stablyio-aave-v3-messari-mainnet", // TODO: Add the graph URL for the mainnet
        batchSize: 100,
      },
      swapRouter: CURVE_SWAP_ROUTER_ADDRESS,
      maxSlippageSurplusSwapBps: 20 * 100 * ONE_BPS_UNIT, // 20% slippage surplus swap
      defaultSwapSlippageBufferBps: 50 * 100 * ONE_BPS_UNIT, // 50% slippage buffer
      defaultSwapParamsList: [
        {
          inputToken: TOKEN_INFO.dUSD.address,
          outputToken: TOKEN_INFO.wfrxETH.address,
          swapExtraParams: {
            route: [
              TOKEN_INFO.dUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.frxUSD.address,
              "0xa0d3911349e701a1f49c1ba2dda34b4ce9636569", // frxUSD/wfrxETH pool
              TOKEN_INFO.wfrxETH.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 30],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
          reverseSwapExtraParams: {
            route: [
              TOKEN_INFO.wfrxETH.address,
              "0xa0d3911349e701a1f49c1ba2dda34b4ce9636569", // frxUSD/wfrxETH pool
              TOKEN_INFO.frxUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.dUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 30],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
        },
        {
          inputToken: TOKEN_INFO.dUSD.address,
          outputToken: TOKEN_INFO.sfrxETH.address,
          swapExtraParams: {
            route: [
              TOKEN_INFO.dUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.frxUSD.address,
              "0xa0d3911349e701a1f49c1ba2dda34b4ce9636569", // frxUSD/wfrxETH pool
              TOKEN_INFO.wfrxETH.address,
              "0xf2f426fe123de7b769b2d4f8c911512f065225d3", // sfrxETH/wfrxETH pool
              TOKEN_INFO.sfrxETH.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 30],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
          reverseSwapExtraParams: {
            route: [
              TOKEN_INFO.sfrxETH.address,
              "0xf2f426fe123de7b769b2d4f8c911512f065225d3",
              TOKEN_INFO.wfrxETH.address,
              "0xa0d3911349e701a1f49c1ba2dda34b4ce9636569",
              TOKEN_INFO.frxUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357",
              TOKEN_INFO.dUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [1, 0, 1, 30],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
        },
        {
          inputToken: TOKEN_INFO.dUSD.address,
          outputToken: TOKEN_INFO.sUSDe.address,
          swapExtraParams: {
            route: [
              TOKEN_INFO.dUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.frxUSD.address,
              "0x8b4e5263e8d6cc0bbf31edf14491fc6077b88229", // frxUSD/USDe pool
              TOKEN_INFO.sUSDe.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
          reverseSwapExtraParams: {
            route: [
              TOKEN_INFO.sUSDe.address,
              "0x8b4e5263e8d6cc0bbf31edf14491fc6077b88229", // frxUSD/USDe pool
              TOKEN_INFO.frxUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.dUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
        },
        {
          inputToken: TOKEN_INFO.dUSD.address,
          outputToken: TOKEN_INFO.sfrxUSD.address,
          swapExtraParams: {
            route: [
              TOKEN_INFO.dUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.frxUSD.address,
              "0xa0d3911349e701a1f49c1ba2dda34b4ce9636569", // frxUSD/wfrxETH pool
              TOKEN_INFO.wfrxETH.address,
              "0xf2f426fe123de7b769b2d4f8c911512f065225d3", // sfrxETH/wfrxETH pool
              TOKEN_INFO.sfrxETH.address,
              "0xacdc85afcd8b83eb171affcbe29fad204f6ae45c", // sfrxUSD/sfrxETH pool
              TOKEN_INFO.sfrxUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 30],
              [0, 1, 1, 10],
              [0, 1, 1, 20],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
          reverseSwapExtraParams: {
            route: [
              TOKEN_INFO.sfrxUSD.address,
              "0xacdc85afcd8b83eb171affcbe29fad204f6ae45c", // sfrxUSD/sfrxETH pool
              TOKEN_INFO.sfrxETH.address,
              "0xf2f426fe123de7b769b2d4f8c911512f065225d3", // sfrxETH/wfrxETH pool
              TOKEN_INFO.wfrxETH.address,
              "0xa0d3911349e701a1f49c1ba2dda34b4ce9636569", // frxUSD/wfrxETH pool
              TOKEN_INFO.frxUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357", // frxUSD/dUSD pool
              TOKEN_INFO.dUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 20],
              [1, 0, 1, 10],
              [1, 0, 1, 30],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
        },
        {
          inputToken: TOKEN_INFO.dUSD.address,
          outputToken: TOKEN_INFO.frxUSD.address,
          swapExtraParams: {
            route: [
              TOKEN_INFO.dUSD.address,
              "0xf16f226baa419d9dc9d92c040ccbc8c0e25f36d7",
              TOKEN_INFO.sUSDe.address,
              "0x8b4e5263e8d6cc0bbf31edf14491fc6077b88229",
              TOKEN_INFO.frxUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [0, 1, 1, 10],
              [1, 0, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
          reverseSwapExtraParams: {
            route: [
              TOKEN_INFO.frxUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357",
              TOKEN_INFO.dUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
        },
        {
          inputToken: TOKEN_INFO.dUSD.address,
          outputToken: TOKEN_INFO.FXB20291231.address,
          swapExtraParams: {
            route: [
              TOKEN_INFO.dUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357",
              TOKEN_INFO.frxUSD.address,
              "0xee454138083b9b9714cac3c7cf12560248d76d6b",
              TOKEN_INFO.FXB20291231.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
          reverseSwapExtraParams: {
            route: [
              TOKEN_INFO.FXB20291231.address,
              "0xee454138083b9b9714cac3c7cf12560248d76d6b",
              TOKEN_INFO.frxUSD.address,
              "0x9ca648d2f51098941688db9a0beb1dadc2d1b357",
              TOKEN_INFO.dUSD.address,
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000",
            ],
            swapParams: [
              [1, 0, 1, 10],
              [0, 1, 1, 10],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
            swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT, // 5% slippage buffer
          },
        },
      ],
      isUnstakeTokens: {
        [TOKEN_INFO.sfrxUSD.address]: true,
      },
      proxyContractMap: {
        [TOKEN_INFO.sfrxUSD.address]:
          "0xBFc4D34Db83553725eC6c768da71D2D9c1456B55", // sfrxUSD proxy contract on Fraxtal mainnet
      },
    },
    liquidatorBotOdos: {
      flashMinter: TOKEN_INFO.dUSD.address,
      dUSDAddress: TOKEN_INFO.dUSD.address,
      slippageTolerance: 50 * 100 * ONE_BPS_UNIT, // 50% slippage tolerance
      healthFactorThreshold: 1,
      healthFactorBatchSize: 5,
      reserveBatchSize: 5,
      profitableThresholdInUSD: 0.001,
      liquidatingBatchSize: 200,
      graphConfig: {
        url: "https://graph-node.dtrinity.org/subgraphs/name/stablyio-aave-v3-messari-mainnet",
        batchSize: 100,
      },
      isUnstakeTokens: {
        [TOKEN_INFO.sfrxUSD.address]: true,
      },
      proxyContractMap: {
        [TOKEN_INFO.sfrxUSD.address]:
          "0xBFc4D34Db83553725eC6c768da71D2D9c1456B55", // sfrxUSD proxy contract on Fraxtal mainnet
      },
      odosRouter: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210",
      odosApiUrl: "https://api.odos.xyz",
    },
    dusd: {
      address: TOKEN_INFO.dUSD.address,
      amoVaults: {
        curveStableSwapNG: {
          pool: "0x9CA648D2f51098941688Db9a0beb1DadC2D1B357", // frxUSD/dUSD pool
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
        //     swapSlippageBufferBps: 50 * 100 * ONE_BPS_UNIT, // 50% slippage buffer
        //   },
        //   defaultUnderlyingToDusdSwapExtraParams: {
        //     route: [TOKEN_INFO.sUSDe.address, TOKEN_INFO.dUSD.address],
        //     swapParams: [],
        //     swapSlippageBufferBps: 50 * 100 * ONE_BPS_UNIT, // 50% slippage buffer
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
            "0xC93Da088b0c78dE892f523db0eECb051Cb628991", // ETH/USD dTrinity OEV
        },
        api3OracleWrappersWithThresholding: {
          [TOKEN_INFO.frxUSD.address]: {
            proxy: "0xA5a23fbE863EfF09690103Cfb9af210e345592Dc", // FRAX/USD dTrinity OEV (legacy FRAX aka frxUSD)
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
          [TOKEN_INFO.FRAX.address]: {
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
            proxy2: "0xA5a23fbE863EfF09690103Cfb9af210e345592Dc", // FRAX/USD dTrinity OEV (legacy FRAX aka frxUSD)
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
            proxy1: "0x029c150a79526bEE6D3Db1b10C07C4CfA6b12485", // scrvUSD/USD dTrinity OEV
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
              api3Proxy: "0xA5a23fbE863EfF09690103Cfb9af210e345592Dc", // FRAX/USD dTrinity OEV (legacy FRAX aka frxUSD)
              api3LowerThresholdInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            },
          },
          [TOKEN_INFO.FXB20251231.address]: {
            pool: "0x63d64a76c2d616676cbac3068d3c6548f8485314", // frxUSD/FXB20251231 pool
            compositeAPI3Feed: {
              api3Asset: TOKEN_INFO.frxUSD.address,
              api3Proxy: "0xA5a23fbE863EfF09690103Cfb9af210e345592Dc", // FRAX/USD dTrinity OEV (legacy FRAX aka frxUSD)
              api3LowerThresholdInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
            },
          },
          [TOKEN_INFO.FXB20551231.address]: {
            pool: "0x4cfc391d75c43cf1bdb368e8bf680aed1228df39", // frxUSD/FXB20551231 pool
            compositeAPI3Feed: {
              api3Asset: TOKEN_INFO.frxUSD.address,
              api3Proxy: "0xA5a23fbE863EfF09690103Cfb9af210e345592Dc", // FRAX/USD dTrinity OEV (legacy FRAX aka frxUSD)
              api3LowerThresholdInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              api3FixedPriceInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveLowerThresholdInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
              curveFixedPriceInBase:
                1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
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
