import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SafeManager } from "../safe/SafeManager";
import {
  SafeConfig,
  SafeTransactionBatch,
  SafeTransactionData,
} from "../safe/types";

/**
 * GovernanceExecutor decides whether to execute operations directly
 * (using signer) or to queue them as Safe transactions for multisig execution.
 *
 * Behavior:
 * - By default, enables Safe queueing only on Fraxtal mainnet/testnet when a `safeConfig` is provided.
 *   You can override by setting USE_SAFE=true in env to force Safe usage on other networks.
 * - For non-Safe mode, direct calls are attempted; on failure, this helper returns false to
 *   indicate pending governance, allowing scripts to flush and exit idempotently.
 */
export class GovernanceExecutor {
  private readonly hre: HardhatRuntimeEnvironment;
  private readonly signer: Signer;
  private readonly safeManager?: SafeManager;
  private readonly transactions: SafeTransactionData[] = [];
  readonly useSafe: boolean;

  constructor(
    hre: HardhatRuntimeEnvironment,
    signer: Signer,
    safeConfig?: SafeConfig,
  ) {
    this.hre = hre;
    this.signer = signer;

    const envForce = process.env.USE_SAFE?.toLowerCase() === "true";
    const chainIdStr = String(hre.network.config.chainId ?? "");
    const isFraxtal = chainIdStr === "252" || chainIdStr === "2522";

    this.useSafe = Boolean(safeConfig) && (isFraxtal || envForce);

    if (this.useSafe && safeConfig) {
      this.safeManager = new SafeManager(hre, signer, { safeConfig });
    }
  }

  /** Initialize Safe only if Safe mode is enabled */
  async initialize(): Promise<void> {
    if (this.safeManager) {
      await this.safeManager.initialize();
    }
  }

  /** Expose queued transactions (read-only) */
  get queuedTransactions(): readonly SafeTransactionData[] {
    return this.transactions;
  }

  /**
   * Attempt an on-chain call; on failure, queue a Safe transaction if enabled.
   * Returns whether the requirement is considered complete (true) or pending
   * governance/manual action (false).
   */
  async tryOrQueue<T>(
    directCall: () => Promise<T>,
    safeTxBuilder?: () => SafeTransactionData,
  ): Promise<boolean> {
    try {
      await directCall();
      return true;
    } catch (error) {
      if (this.useSafe && safeTxBuilder) {
        const tx = safeTxBuilder();
        this.transactions.push(tx);
        return false;
      }
      console.warn(
        "Direct execution failed; marking requirement as pending:",
        error,
      );
      return false;
    }
  }

  /**
   * Flush queued transactions into a Safe batch (if any and in Safe mode).
   * Returns true if either not in Safe mode, or batch prepared successfully.
   */
  async flush(description: string): Promise<boolean> {
    if (!this.useSafe || !this.safeManager || this.transactions.length === 0) {
      return true;
    }

    const batch: SafeTransactionBatch = {
      description,
      transactions: this.transactions,
    };

    const res = await this.safeManager.createBatchTransaction(batch);
    return res.success;
  }
}


