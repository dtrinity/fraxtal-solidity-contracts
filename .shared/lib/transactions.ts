import type { ContractTransactionResponse, TransactionReceipt } from "ethers";

export interface WaitForTxReceiptOptions {
  readonly confirmations?: number;
  readonly onRetry?: (message: string) => void;
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
}

/**
 * Waits for a transaction receipt with optional retries and hash polling when tx.wait() flakes.
 */
export async function waitForTxReceipt(
  tx: ContractTransactionResponse,
  options: WaitForTxReceiptOptions = {},
): Promise<TransactionReceipt | null> {
  const confirmations = options.confirmations ?? 1;
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const onRetry = options.onRetry;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await tx.wait(confirmations);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      onRetry?.(`Receipt wait failed (attempt ${attempt}/${maxAttempts}): ${message}`);
    }
  }

  if (tx.hash && tx.provider) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    onRetry?.(`tx.wait() failed after ${maxAttempts} attempt(s) (${message}); polling receipt for ${tx.hash}...`);
    return tx.provider.waitForTransaction(tx.hash, confirmations, timeoutMs);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
