import { ONE_BPS_UNIT } from "../../../utils/constants";
import { LiquidatorBotOdosConfig } from "../../types";

export const TOKEN_INFO = {
  sfrxUSD: {
    address: "0xfc00000000000000000000000000000000000008",
    priceAggregator: "", // Fall back to OracleAggregator
  },
  dUSD: {
    address: "0x788D96f655735f52c676A133f4dFC53cEC614d4A",
    priceAggregator: "", // Fall back to OracleAggregator
  },
};

export const liquidatorBotOdos: LiquidatorBotOdosConfig = {
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
    [TOKEN_INFO.sfrxUSD.address]: "0xBFc4D34Db83553725eC6c768da71D2D9c1456B55", // sfrxUSD proxy contract on Fraxtal mainnet
  },
  odosRouter: "0x56c85a254DD12eE8D9C04049a4ab62769Ce98210",
  odosApiUrl: "https://api.odos.xyz",
};
