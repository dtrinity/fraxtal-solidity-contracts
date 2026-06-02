export interface WaitForTxReceiptOptions {
  readonly confirmations?: number;
  readonly onRetry?: (message: string) => void;
  readonly maxAttempts?: number;
}

/**
 * Waits for a transaction receipt with optional retries when the RPC drops the pending tx.
 */
export async function waitForTxReceipt(
  tx: { hash: string; wait: (confirmations?: number) => Promise<{ hash: string } | null> },
  options: WaitForTxReceiptOptions = {},
): Promise<{ hash: string } | null> {
  const confirmations = options.confirmations ?? 1;
  const maxAttempts = options.maxAttempts ?? 3;
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

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
