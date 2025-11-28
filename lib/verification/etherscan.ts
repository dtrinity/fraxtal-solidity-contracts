/**
 * Patch Hardhat's Etherscan plugin to support chain IDs required by our deployments.
 * Currently a no-op placeholder to keep script execution resilient.
 */
export function patchEtherscanV2ChainIdSupport(): void {
  // Intentionally empty
}

/**
 * Detects whether a verification error indicates the contract is already verified.
 *
 * @param error - The error thrown by the verify task
 * @returns True if the error message suggests the contract is already verified
 */
export function isAlreadyVerifiedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("already verified");
}
