import { ONE_BPS_UNIT } from "../../../utils/constants";
import { LiquidatorBotUniswapV3Config } from "../../types";

export const liquidatorBotUniswapV3: LiquidatorBotUniswapV3Config | undefined = {
  flashMinter: "", // Will be populated from DUSDDeployment
  dUSDAddress: "", // Will be populated from DUSDDeployment
  slippageTolerance: 50 * 100 * ONE_BPS_UNIT, // 50% slippage tolerance
  healthFactorThreshold: 1,
  healthFactorBatchSize: 10,
  reserveBatchSize: 10,
  profitableThresholdInUSD: 1,
  liquidatingBatchSize: 200,
  graphConfig: {
    url: "", // Not used for localhost
    batchSize: 0,
  },
  isUnstakeTokens: {}, // No unstake tokens on localhost
  proxyContractMap: {}, // No proxy contracts
};
