import {
  DLOOP_VAULT_CURVE_ID_PREFIX,
  DLOOP_VAULT_UNISWAP_V3_ID_PREFIX,
} from "./deploy-ids";

/**
 * Get the name of the DLoopVaultUniswapV3 deployment
 *
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param targetLeverageBps - The target leverage in bps
 * @returns - The name of the DLoopVaultUniswapV3 deployment
 */
export function getDLoopVaultUniswapV3DeploymentName(
  underlyingTokenSymbol: string,
  targetLeverageBps: number,
): string {
  return `${DLOOP_VAULT_UNISWAP_V3_ID_PREFIX}-${underlyingTokenSymbol}-${targetLeverageBps}`;
}

/**
 * Get the name of the DLoopVaultCurve deployment
 *
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param targetLeverageBps - The target leverage in bps
 * @returns - The name of the DLoopVaultCurve deployment
 */
export function getDLoopVaultCurveDeploymentName(
  underlyingTokenSymbol: string,
  targetLeverageBps: number,
): string {
  return `${DLOOP_VAULT_CURVE_ID_PREFIX}-${underlyingTokenSymbol}-${targetLeverageBps}`;
}

/**
 * Convert the target leverage in bps to a human-readable format
 * - For example, 30000 bps will be converted to "3X", 50000 bps will be converted to "5X"
 *
 * @param targetLeverageBps - The target leverage in bps
 * @returns - The target leverage in a human-readable format
 */
export function convertTargetLeverageBpsToX(targetLeverageBps: number): string {
  const ratio = Math.round(targetLeverageBps / 10000);
  return `${ratio}X`;
}
