/**
 * Attack Constants for Odos Exploit Reproduction (Fraxtal)
 *
 * These constants are derived from the production Fraxtal attack transaction:
 * 0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32
 *
 * KEY DIFFERENCES FROM SONIC:
 * - Three victims with three different collateral types (dUSD, sfrxETH, sUSDe)
 * - Fraxtal dUSD uses 6 decimals (vs Sonic's 18)
 * - Flash-mint amount: 40,000 dUSD (vs Sonic's 27,000)
 * - Three sequential swapLiquidity calls in one transaction
 *
 * All values are in wei/micro-units to ensure exact precision matching.
 * DO NOT use floating point or formatted strings for these values.
 */

import { ethers } from "hardhat";

/**
 * Token decimals
 */
export const DECIMALS = {
  DUSD: 6,        // dUSD on Fraxtal uses 6 decimals (different from Sonic!)
  SFRXETH: 18,    // sfrxETH uses 18 decimals
  SUSDE: 18,      // sUSDe uses 18 decimals
} as const;

/**
 * Flash-mint constants
 *
 * The Fraxtal attack uses a 40,000 dUSD flash-mint to provide working capital
 * for three sequential victim drains
 */
export const FLASH_MINT = {
  /**
   * Flash mint amount: exactly 40,000 dUSD (6 decimals on Fraxtal)
   * This is minted from zero address and must be repaid in the same transaction
   */
  AMOUNT: 40_000_000_000n, // 40,000 * 1e6

  /**
   * Approximate total debt repayment across all three victims
   * Based on flash-mint delta: ~37,902.15 dUSD
   */
  DEBT_REPAYMENT_TOTAL: ethers.parseUnits("37902.15", DECIMALS.DUSD),
} as const;

/**
 * Victim 1: dUSD Collateral
 *
 * Address: 0x48a906fcb66caf68ea3fdd8054309d9f0c268735
 * Collateral: 25,660.57 dUSD (6 decimals)
 */
export const VICTIM_1_DUSD = {
  /**
   * Amount of victim collateral swapped via the adapter
   * Source: Production tx shows 25,660.57 dUSD withdrawn
   */
  COLLATERAL_TO_SWAP: 25_660_570_000n, // 25,660.57 * 1e6

  /**
   * Dust output returned to adapter (1 micro unit for 6-decimal token)
   * This negligible amount satisfies minOut while stealing the rest
   */
  DUST_OUTPUT: 1n, // 0.000001 dUSD

  /**
   * Net amount of victim collateral drained
   */
  get NET_VICTIM_DRAIN(): bigint {
    return this.COLLATERAL_TO_SWAP - this.DUST_OUTPUT;
  },

  /**
   * Flash loan premium rate: 5 basis points (0.05%)
   */
  FLASH_LOAN_PREMIUM_BPS: 5,

  /**
   * Calculated flash loan premium
   * = 25,660.57 * 0.0005 = 12.83 dUSD (approx)
   */
  get FLASH_LOAN_PREMIUM(): bigint {
    return (this.COLLATERAL_TO_SWAP * BigInt(this.FLASH_LOAN_PREMIUM_BPS)) / 10_000n;
  },

  /**
   * Flash swap amount (excludes premium for initial calculation)
   */
  get FLASH_SWAP_AMOUNT(): bigint {
    return this.COLLATERAL_TO_SWAP - this.FLASH_LOAN_PREMIUM;
  },
} as const;

/**
 * Victim 2: sfrxETH Collateral
 *
 * Address: 0xc51fefb9ef83f2d300448b22db6fac032f96df3f
 * Collateral: 9.47 sfrxETH (18 decimals)
 */
export const VICTIM_2_SFRXETH = {
  /**
   * Amount of victim collateral swapped via the adapter
   * Source: Production tx shows 9.47 sfrxETH withdrawn
   */
  COLLATERAL_TO_SWAP: ethers.parseEther("9.47"),

  /**
   * Dust output returned to adapter (1 wei for 18-decimal token)
   * This negligible amount satisfies minOut while stealing the rest
   */
  DUST_OUTPUT: 1n, // 1e-18 sfrxETH

  /**
   * Net amount of victim collateral drained
   */
  get NET_VICTIM_DRAIN(): bigint {
    return this.COLLATERAL_TO_SWAP - this.DUST_OUTPUT;
  },

  /**
   * Flash loan premium rate: 5 basis points (0.05%)
   */
  FLASH_LOAN_PREMIUM_BPS: 5,

  /**
   * Calculated flash loan premium
   * = 9.47 * 0.0005 = 0.004735 sfrxETH
   */
  get FLASH_LOAN_PREMIUM(): bigint {
    return (this.COLLATERAL_TO_SWAP * BigInt(this.FLASH_LOAN_PREMIUM_BPS)) / 10_000n;
  },

  /**
   * Flash swap amount (excludes premium for initial calculation)
   */
  get FLASH_SWAP_AMOUNT(): bigint {
    return this.COLLATERAL_TO_SWAP - this.FLASH_LOAN_PREMIUM;
  },
} as const;

/**
 * Victim 3: sUSDe Collateral
 *
 * Address: 0xc5f8792685147297f5c11c08a0b3de2a4000b61a
 * Collateral: 7,089.91 sUSDe (18 decimals)
 */
export const VICTIM_3_SUSDE = {
  /**
   * Amount of victim collateral swapped via the adapter
   * Source: Production tx shows 7,089.91 sUSDe withdrawn
   */
  COLLATERAL_TO_SWAP: ethers.parseEther("7089.91"),

  /**
   * Dust output returned to adapter (1 wei for 18-decimal token)
   * This negligible amount satisfies minOut while stealing the rest
   */
  DUST_OUTPUT: 1n, // 1e-18 sUSDe

  /**
   * Net amount of victim collateral drained
   */
  get NET_VICTIM_DRAIN(): bigint {
    return this.COLLATERAL_TO_SWAP - this.DUST_OUTPUT;
  },

  /**
   * Flash loan premium rate: 5 basis points (0.05%)
   */
  FLASH_LOAN_PREMIUM_BPS: 5,

  /**
   * Calculated flash loan premium
   * = 7,089.91 * 0.0005 = 3.544955 sUSDe
   */
  get FLASH_LOAN_PREMIUM(): bigint {
    return (this.COLLATERAL_TO_SWAP * BigInt(this.FLASH_LOAN_PREMIUM_BPS)) / 10_000n;
  },

  /**
   * Flash swap amount (excludes premium for initial calculation)
   */
  get FLASH_SWAP_AMOUNT(): bigint {
    return this.COLLATERAL_TO_SWAP - this.FLASH_LOAN_PREMIUM;
  },
} as const;

/**
 * Attack summary aggregates
 *
 * These help verify the total impact across all three victims
 */
export const ATTACK_SUMMARY = {
  /**
   * Total number of victims exploited in single transaction
   */
  VICTIM_COUNT: 3,

  /**
   * Total approximate USD value stolen
   * Based on transaction analysis: ~$42,000-$43,000
   */
  TOTAL_USD_VALUE_STOLEN: 42_500, // Approximate midpoint

  /**
   * Estimated per-victim values (for documentation)
   * - Victim 1 (dUSD): ~$25,660
   * - Victim 2 (sfrxETH): ~$9,470 (at ~$1,000/ETH)
   * - Victim 3 (sUSDe): ~$7,090
   */
} as const;

/**
 * Expected balance changes for key participants
 *
 * These help structure assertions about the attack's outcome
 */
export const EXPECTED_DELTAS = {
  // Victim 1 (dUSD)
  VICTIM_1_ATOKEN_DELTA: -VICTIM_1_DUSD.NET_VICTIM_DRAIN,

  // Victim 2 (sfrxETH)
  VICTIM_2_ATOKEN_DELTA: -VICTIM_2_SFRXETH.NET_VICTIM_DRAIN,

  // Victim 3 (sUSDe)
  VICTIM_3_ATOKEN_DELTA: -VICTIM_3_SUSDE.NET_VICTIM_DRAIN,

  // Attacker gains (collateral stolen minus flash-loan premium)
  ATTACKER_DUSD_GAIN: VICTIM_1_DUSD.FLASH_SWAP_AMOUNT,
  ATTACKER_SFRXETH_GAIN: VICTIM_2_SFRXETH.FLASH_SWAP_AMOUNT,
  ATTACKER_SUSDE_GAIN: VICTIM_3_SUSDE.FLASH_SWAP_AMOUNT,

  /**
   * Executor should have zero balance after attack (all swept to attacker)
   */
  EXECUTOR_DUSD_FINAL: 0n,
  EXECUTOR_SFRXETH_FINAL: 0n,
  EXECUTOR_SUSDE_FINAL: 0n,

  /**
   * Adapter should have zero balance after attack (no residual dust)
   */
  ADAPTER_DUSD_FINAL: 0n,
  ADAPTER_SFRXETH_FINAL: 0n,
  ADAPTER_SUSDE_FINAL: 0n,
} as const;

/**
 * Event names for structured assertions
 *
 * These match the events emitted by the mock contracts
 */
export const ATTACK_EVENTS = {
  // Router events
  COLLATERAL_PULLED: "CollateralPulled",

  // AttackExecutor events
  FLASH_MINT_STARTED: "FlashMintStarted",
  FLASH_MINT_SETTLED: "FlashMintSettled",
  ATTACKER_BURST: "AttackerBurst",
  COLLATERAL_DUST_RETURNED: "CollateralDustReturned",
  SWAP_EXECUTION_STARTED: "SwapExecutionStarted",
  SWAP_EXECUTION_COMPLETED: "SwapExecutionCompleted",

  // Pool events
  FLASH_LOAN_EXECUTED: "FlashLoanExecuted",
  RESERVE_BURNED: "ReserveBurned",
  WITHDRAW_PERFORMED: "WithdrawPerformed",
} as const;

/**
 * Precision tolerances for assertions
 *
 * Most assertions should use EXACT (0) tolerance.
 * Only use ROUNDING when multi-step calculations introduce unavoidable precision loss.
 */
export const PRECISION_TOLERANCE = {
  /**
   * Exact match required (0 wei/micro-unit difference)
   * Use for: direct transfers, flash loan amounts, attacker gains
   */
  EXACT: 0n,

  /**
   * Single wei/micro-unit tolerance
   * Use for: flash loan premiums with division rounding
   */
  WEI_LEVEL: 1n,

  /**
   * Small rounding tolerance (10 wei/micro-units)
   * Use for: multi-step conversions with intermediate rounding
   */
  ROUNDING: 10n,
} as const;

/**
 * Validation helpers
 */
export function validateConstants(): void {
  // Ensure victim 1 (dUSD) calculations are correct
  const v1ExpectedPremium = (VICTIM_1_DUSD.COLLATERAL_TO_SWAP * 5n) / 10_000n;
  if (VICTIM_1_DUSD.FLASH_LOAN_PREMIUM !== v1ExpectedPremium) {
    throw new Error("Victim 1 flash loan premium mismatch");
  }

  // Ensure victim 2 (sfrxETH) calculations are correct
  const v2ExpectedPremium = (VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP * 5n) / 10_000n;
  if (VICTIM_2_SFRXETH.FLASH_LOAN_PREMIUM !== v2ExpectedPremium) {
    throw new Error("Victim 2 flash loan premium mismatch");
  }

  // Ensure victim 3 (sUSDe) calculations are correct
  const v3ExpectedPremium = (VICTIM_3_SUSDE.COLLATERAL_TO_SWAP * 5n) / 10_000n;
  if (VICTIM_3_SUSDE.FLASH_LOAN_PREMIUM !== v3ExpectedPremium) {
    throw new Error("Victim 3 flash loan premium mismatch");
  }

  // Ensure dust amounts are appropriate for token decimals
  if (VICTIM_1_DUSD.DUST_OUTPUT !== 1n) {
    throw new Error("Victim 1 dust output should be 1 micro-unit");
  }
  if (VICTIM_2_SFRXETH.DUST_OUTPUT !== 1n) {
    throw new Error("Victim 2 dust output should be 1 wei");
  }
  if (VICTIM_3_SUSDE.DUST_OUTPUT !== 1n) {
    throw new Error("Victim 3 dust output should be 1 wei");
  }
}

// Run validation on import
validateConstants();
