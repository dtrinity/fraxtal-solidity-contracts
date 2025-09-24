import { ethers } from "ethers";

import { ONE_BPS_UNIT } from "../../../utils/constants";
import { LiquidatorBotCurveConfig } from "../../types";

export const CURVE_SWAP_ROUTER_ADDRESS = "0xF66c3Ef85BceafaEcE9171E25Eee2972b10e1958";

export const TOKEN_INFO = {
  dUSD: {
    address: "0x4D6E79013212F10A026A1FB0b926C9Fd0432b96c",
  },
  FRAX: {
    address: "0x2CAb811d351B4eF492D8C197E09939F1C9f54330",
  },
  sFRAX: {
    address: "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
  },
};

export const CURVE_POOLS = {
  stableswapng: {
    /* eslint-disable camelcase -- Naming convention is disabled for the pool names */
    dUSD_FRAX: {
      address: "0x93f785642837e082ff95bB69E64e5B6967857c74",
      tokens: [TOKEN_INFO.dUSD, TOKEN_INFO.FRAX],
    },
    FRAX_sFRAX: {
      address: "0x6a7173EA306983f3721Cc9A3c6EA7f0a3a2f3c13",
      tokens: [TOKEN_INFO.FRAX, TOKEN_INFO.sFRAX],
    },
    /* eslint-enable camelcase -- Re-enable naming convention at the end of the file */
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
    url: "https://fraxtal-testnet-subgraph.testnet.dtrinity.org/subgraphs/name/stablyio-aave-v3-messari-testnet/",
    batchSize: 100,
  },
  swapRouter: CURVE_SWAP_ROUTER_ADDRESS,
  maxSlippageSurplusSwapBps: 20 * 100 * ONE_BPS_UNIT, // 20% slippage surplus swap
  defaultSwapSlippageBufferBps: 50 * 100 * ONE_BPS_UNIT, // 50% slippage buffer
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
  isUnstakeTokens: {
    [TOKEN_INFO.sFRAX.address]: true,
  },
  proxyContractMap: {}, // No proxy contracts
};
