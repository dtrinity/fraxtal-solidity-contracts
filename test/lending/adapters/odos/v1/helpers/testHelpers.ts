/**
 * Test Helper Utilities for Exploit Reproduction
 *
 * These utilities provide decimal-aware balance tracking, event parsing,
 * and state snapshot functionality for the Odos adapter exploit tests.
 */

import { ethers } from "hardhat";
import { ContractTransactionReceipt } from "ethers";

/**
 * Formats a balance change with decimal awareness
 * @param amount The raw wei/micro-unit amount
 * @param decimals Number of decimals for the token (6 for dUSD, 18 for sfrxETH/sUSDe)
 * @param symbol Optional token symbol for display
 */
export function formatBalanceChange(
  amount: bigint,
  decimals: number,
  symbol?: string
): string {
  const formatted = ethers.formatUnits(amount, decimals);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Calculates and formats balance difference
 * @param before Balance before operation
 * @param after Balance after operation
 * @param decimals Token decimals
 * @param symbol Token symbol
 * @returns Formatted string with sign indicator
 */
export function formatBalanceDiff(
  before: bigint,
  after: bigint,
  decimals: number,
  symbol?: string
): string {
  const diff = after - before;
  const sign = diff >= 0n ? "+" : "";
  return sign + formatBalanceChange(diff, decimals, symbol);
}

/**
 * Balance snapshot for a single address and token
 */
export interface BalanceSnapshot {
  address: string;
  token: string;
  balance: bigint;
  label?: string;
}

/**
 * Helper to capture balance snapshots
 */
export class BalanceTracker {
  private snapshots: Map<string, bigint> = new Map();

  /**
   * Creates a unique key for address+token pair
   */
  private key(address: string, token: string): string {
    return `${address.toLowerCase()}-${token.toLowerCase()}`;
  }

  /**
   * Records a balance snapshot
   */
  async snapshot(
    address: string,
    token: string,
    tokenContract: any,
    label?: string
  ): Promise<void> {
    const balance = await tokenContract.balanceOf(address);
    const k = this.key(address, token);
    this.snapshots.set(k, balance);
    if (label) {
      this.snapshots.set(`${k}-label`, BigInt(label.length)); // Store label metadata
    }
  }

  /**
   * Retrieves a previously recorded balance
   */
  getSnapshot(address: string, token: string): bigint | undefined {
    return this.snapshots.get(this.key(address, token));
  }

  /**
   * Calculates the delta between current balance and snapshot
   */
  async delta(
    address: string,
    token: string,
    tokenContract: any
  ): Promise<bigint> {
    const current = await tokenContract.balanceOf(address);
    const previous = this.snapshots.get(this.key(address, token));
    if (previous === undefined) {
      throw new Error(
        `No snapshot found for ${address} + ${token}. Call snapshot() first.`
      );
    }
    return current - previous;
  }

  /**
   * Clears all snapshots
   */
  clear(): void {
    this.snapshots.clear();
  }
}

/**
 * Event log extraction helper
 */
export interface ParsedEvent {
  name: string;
  args: Record<string, any>;
  address: string;
}

/**
 * Extracts events from a transaction receipt
 * @param receipt Transaction receipt
 * @param contractInterface Contract interface to parse events
 * @param eventName Optional filter for specific event name
 */
export function parseEvents(
  receipt: ContractTransactionReceipt | null,
  contractInterface: any,
  eventName?: string
): ParsedEvent[] {
  if (!receipt) {
    return [];
  }

  const parsed: ParsedEvent[] = [];

  for (const log of receipt.logs) {
    try {
      const parsedLog = contractInterface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });

      if (parsedLog && (!eventName || parsedLog.name === eventName)) {
        const args: Record<string, any> = {};
        parsedLog.args.forEach((value: any, index: number) => {
          // Store both by index and by name if available
          args[index.toString()] = value;
          if (parsedLog.fragment.inputs[index]) {
            args[parsedLog.fragment.inputs[index].name] = value;
          }
        });

        parsed.push({
          name: parsedLog.name,
          args,
          address: log.address,
        });
      }
    } catch {
      // Skip logs that don't match the interface
      continue;
    }
  }

  return parsed;
}

/**
 * Finds the first event matching the given name
 */
export function findEvent(
  receipt: ContractTransactionReceipt | null,
  contractInterface: any,
  eventName: string
): ParsedEvent | undefined {
  const events = parseEvents(receipt, contractInterface, eventName);
  return events[0];
}

/**
 * Finds all events matching the given name
 */
export function findEvents(
  receipt: ContractTransactionReceipt | null,
  contractInterface: any,
  eventName: string
): ParsedEvent[] {
  return parseEvents(receipt, contractInterface, eventName);
}

/**
 * Attack flow state snapshot for three-victim Fraxtal exploit
 * Captures key balances before/after attack for structured assertions
 */
export interface AttackStateSnapshot {
  // Victim 1 (dUSD) state
  victim1ATokenBalance: bigint;
  victim1CollateralBalance: bigint;

  // Victim 2 (sfrxETH) state
  victim2ATokenBalance: bigint;
  victim2CollateralBalance: bigint;

  // Victim 3 (sUSDe) state
  victim3ATokenBalance: bigint;
  victim3CollateralBalance: bigint;

  // Attacker state (receives all three collateral types)
  attackerDusdBalance: bigint;
  attackerSfrxethBalance: bigint;
  attackerSusdeBalance: bigint;

  // Executor state (should be swept clean after attack)
  executorDusdBalance: bigint;
  executorSfrxethBalance: bigint;
  executorSusdeBalance: bigint;

  // Adapter state (should have no residue)
  adapterDusdBalance: bigint;
  adapterSfrxethBalance: bigint;
  adapterSusdeBalance: bigint;
}

/**
 * Captures a complete attack state snapshot for three-victim scenario
 */
export async function captureAttackState(
  victim1: any,
  victim2: any,
  victim3: any,
  attacker: any,
  executor: any,
  adapter: any,
  aDusd: any,
  aSfrxeth: any,
  aSusde: any,
  dusd: any,
  sfrxeth: any,
  susde: any
): Promise<AttackStateSnapshot> {
  return {
    // Victim 1 balances
    victim1ATokenBalance: await aDusd.balanceOf(victim1.address),
    victim1CollateralBalance: await dusd.balanceOf(victim1.address),

    // Victim 2 balances
    victim2ATokenBalance: await aSfrxeth.balanceOf(victim2.address),
    victim2CollateralBalance: await sfrxeth.balanceOf(victim2.address),

    // Victim 3 balances
    victim3ATokenBalance: await aSusde.balanceOf(victim3.address),
    victim3CollateralBalance: await susde.balanceOf(victim3.address),

    // Attacker balances (receives all three collateral types)
    attackerDusdBalance: await dusd.balanceOf(attacker.address),
    attackerSfrxethBalance: await sfrxeth.balanceOf(attacker.address),
    attackerSusdeBalance: await susde.balanceOf(attacker.address),

    // Executor balances
    executorDusdBalance: await dusd.balanceOf(await executor.getAddress()),
    executorSfrxethBalance: await sfrxeth.balanceOf(await executor.getAddress()),
    executorSusdeBalance: await susde.balanceOf(await executor.getAddress()),

    // Adapter balances
    adapterDusdBalance: await dusd.balanceOf(await adapter.getAddress()),
    adapterSfrxethBalance: await sfrxeth.balanceOf(await adapter.getAddress()),
    adapterSusdeBalance: await susde.balanceOf(await adapter.getAddress()),
  };
}

/**
 * Computes attack state deltas
 */
export interface AttackStateDelta {
  // Victim 1 deltas
  victim1ATokenDelta: bigint;
  victim1CollateralDelta: bigint;

  // Victim 2 deltas
  victim2ATokenDelta: bigint;
  victim2CollateralDelta: bigint;

  // Victim 3 deltas
  victim3ATokenDelta: bigint;
  victim3CollateralDelta: bigint;

  // Attacker deltas
  attackerDusdDelta: bigint;
  attackerSfrxethDelta: bigint;
  attackerSusdeDelta: bigint;

  // Executor deltas
  executorDusdDelta: bigint;
  executorSfrxethDelta: bigint;
  executorSusdeDelta: bigint;

  // Adapter deltas
  adapterDusdDelta: bigint;
  adapterSfrxethDelta: bigint;
  adapterSusdeDelta: bigint;
}

/**
 * Calculates deltas between two attack state snapshots
 */
export function computeAttackDeltas(
  before: AttackStateSnapshot,
  after: AttackStateSnapshot
): AttackStateDelta {
  return {
    // Victim 1 deltas
    victim1ATokenDelta: after.victim1ATokenBalance - before.victim1ATokenBalance,
    victim1CollateralDelta: after.victim1CollateralBalance - before.victim1CollateralBalance,

    // Victim 2 deltas
    victim2ATokenDelta: after.victim2ATokenBalance - before.victim2ATokenBalance,
    victim2CollateralDelta: after.victim2CollateralBalance - before.victim2CollateralBalance,

    // Victim 3 deltas
    victim3ATokenDelta: after.victim3ATokenBalance - before.victim3ATokenBalance,
    victim3CollateralDelta: after.victim3CollateralBalance - before.victim3CollateralBalance,

    // Attacker deltas
    attackerDusdDelta: after.attackerDusdBalance - before.attackerDusdBalance,
    attackerSfrxethDelta: after.attackerSfrxethBalance - before.attackerSfrxethBalance,
    attackerSusdeDelta: after.attackerSusdeBalance - before.attackerSusdeBalance,

    // Executor deltas
    executorDusdDelta: after.executorDusdBalance - before.executorDusdBalance,
    executorSfrxethDelta: after.executorSfrxethBalance - before.executorSfrxethBalance,
    executorSusdeDelta: after.executorSusdeBalance - before.executorSusdeBalance,

    // Adapter deltas
    adapterDusdDelta: after.adapterDusdBalance - before.adapterDusdBalance,
    adapterSfrxethDelta: after.adapterSfrxethBalance - before.adapterSfrxethBalance,
    adapterSusdeDelta: after.adapterSusdeBalance - before.adapterSusdeBalance,
  };
}

/**
 * Assertion helper that provides better error messages for wei-level comparisons
 *
 * @param actual Actual value
 * @param expected Expected value
 * @param decimals Token decimals for formatting error messages
 * @param label Description for the assertion
 * @param tolerance Optional tolerance in wei (default: 0 for exact match)
 */
export function assertBalanceEquals(
  actual: bigint,
  expected: bigint,
  decimals: number,
  label: string,
  tolerance: bigint = 0n
): void {
  const diff = actual > expected ? actual - expected : expected - actual;

  if (diff > tolerance) {
    const actualFormatted = ethers.formatUnits(actual, decimals);
    const expectedFormatted = ethers.formatUnits(expected, decimals);
    const diffFormatted = ethers.formatUnits(diff, decimals);

    throw new Error(
      `${label}: Expected ${expectedFormatted} but got ${actualFormatted} (diff: ${diffFormatted})`
    );
  }
}

/**
 * Precision handling notes for test authors
 *
 * IMPORTANT: This exploit involves three token types with different decimals:
 * - dUSD: 6 decimals on Fraxtal (micro-units, 1e6) - DIFFERENT from Sonic's 18!
 * - sfrxETH: 18 decimals (wei, 1e18)
 * - sUSDe: 18 decimals (wei, 1e18)
 *
 * Wei-level precision requirements:
 * 1. Direct token transfers should be exact (0 tolerance)
 * 2. Flash loan premiums calculated as (amount * 5) / 10000 may have rounding
 * 3. Each victim returns exactly 1 micro-unit (respecting token decimals)
 *
 * When to use approximate equality:
 * - Flash loan premium calculations (±1 wei/micro-unit tolerance)
 *
 * When to require exact equality:
 * - Victim aToken balance changes (must equal COLLATERAL_TO_SWAP exactly)
 * - Attacker net gains (must match stolen amounts exactly)
 * - Flash mint amount (must equal 40,000 dUSD exactly)
 */

/**
 * Constants for common precision tolerances
 */
export const PRECISION = {
  EXACT: 0n,
  WEI_LEVEL: 1n,
  MICRO_LEVEL: 1n, // For 6-decimal tokens
  ROUNDING_TOLERANCE: 10n, // For multi-step calculations
} as const;
