import { ONE_BPS_UNIT } from "../../../utils/constants";
import { LiquidatorBotCurveConfig } from "../../types";

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
  sUSDe: {
    address: "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  FXB20291231: {
    address: "0xf1e2b576af4c6a7ee966b14c810b772391e92153",
    priceAggregator: "", // Fall back to OracleAggregator
  },
};

export const liquidatorBotCurve: LiquidatorBotCurveConfig = {
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
    [TOKEN_INFO.sfrxUSD.address]: "0xBFc4D34Db83553725eC6c768da71D2D9c1456B55", // sfrxUSD proxy contract on Fraxtal mainnet
  },
};
