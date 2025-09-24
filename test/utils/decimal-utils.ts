import { BigNumberish } from "ethers";

// Fraxtal decimal configurations
export const DUSD_DECIMALS = 6;
export const ORACLE_DECIMALS = 8;
export const DEFAULT_TOKEN_DECIMALS = 18;

/**
 * Converts a price from one decimal precision to another.
 * Useful for converting between oracle prices and token amounts.
 *
 * @param value - The value to convert
 * @param fromDecimals - Source decimal precision
 * @param toDecimals - Target decimal precision
 * @returns The converted value in the target decimal precision
 */
export function convertDecimalPrecision(value: BigNumberish, fromDecimals: number, toDecimals: number): bigint {
  const valueBigInt = BigInt(value.toString());

  if (fromDecimals > toDecimals) {
    const divisor = 10n ** BigInt(fromDecimals - toDecimals);
    return valueBigInt / divisor;
  } else if (fromDecimals < toDecimals) {
    const multiplier = 10n ** BigInt(toDecimals - fromDecimals);
    return valueBigInt * multiplier;
  } else {
    return valueBigInt;
  }
}

/**
 * Converts an oracle price (8 decimals) to match dUSD decimals (6 decimals).
 * Useful for value calculations in Fraxtal where oracle prices have 8 decimals
 * but dUSD has only 6 decimals.
 *
 * @param oraclePrice - The oracle price to convert
 * @param fromDecimals - Source decimal precision (default: ORACLE_DECIMALS)
 * @param toDecimals - Target decimal precision (default: DUSD_DECIMALS)
 * @returns The converted price in the target decimal precision
 */
export function convertOraclePrice(
  oraclePrice: BigNumberish,
  fromDecimals: number = ORACLE_DECIMALS,
  toDecimals: number = DUSD_DECIMALS,
): bigint {
  return convertDecimalPrecision(oraclePrice, fromDecimals, toDecimals);
}

/**
 * Calculates the value of a token amount in dUSD terms using oracle price.
 *
 * @param tokenAmount - Amount of tokens
 * @param tokenDecimals - Decimal precision of the token
 * @param oraclePrice - Price from oracle (8 decimals)
 * @returns Value in dUSD terms (6 decimals)
 */
export function calculateValueInDUSD(tokenAmount: BigNumberish, tokenDecimals: number, oraclePrice: BigNumberish): bigint {
  const amountBigInt = BigInt(tokenAmount.toString());
  const priceBigInt = BigInt(oraclePrice.toString());

  // Calculate value in 18 decimal precision first
  // (tokenAmount * oraclePrice) / (10^tokenDecimals)
  const valueInHighPrecision = (amountBigInt * priceBigInt) / 10n ** BigInt(tokenDecimals);

  // Convert from oracle decimals to dUSD decimals
  return convertDecimalPrecision(valueInHighPrecision, ORACLE_DECIMALS, DUSD_DECIMALS);
}

/**
 * Calculates the token amount needed to get a specific dUSD value.
 *
 * @param dusdValue - Target value in dUSD (6 decimals)
 * @param tokenDecimals - Decimal precision of the token
 * @param oraclePrice - Price from oracle (8 decimals)
 * @returns Amount of tokens needed
 */
export function calculateTokenAmountForDUSDValue(dusdValue: BigNumberish, tokenDecimals: number, oraclePrice: BigNumberish): bigint {
  const valueBigInt = BigInt(dusdValue.toString());
  const priceBigInt = BigInt(oraclePrice.toString());

  // Convert dUSD value to oracle decimal precision
  const valueInOracleDecimals = convertDecimalPrecision(valueBigInt, DUSD_DECIMALS, ORACLE_DECIMALS);

  // Calculate token amount: (value * 10^tokenDecimals) / price
  return (valueInOracleDecimals * 10n ** BigInt(tokenDecimals)) / priceBigInt;
}

/**
 * Handles potential rounding issues when working with 6-decimal dUSD.
 * Ensures minimum precision requirements are met.
 *
 * @param amount - The amount to validate
 * @param decimals - The decimal precision to validate against
 * @returns True if the amount meets precision requirements, false if it's dust
 */
export function validateDecimalPrecision(amount: BigNumberish, decimals: number): boolean {
  const amountBigInt = BigInt(amount.toString());

  // For amounts less than 1 unit in the given decimal precision,
  // ensure they're not dust that would be lost in calculations
  const minUnit = 10n ** BigInt(decimals);

  if (amountBigInt > 0n && amountBigInt < minUnit) {
    // This is a dust amount - might cause precision issues
    return false;
  }

  return true;
}

/**
 * Fee calculation helper that accounts for Fraxtal's 6-decimal precision.
 *
 * @param amount - Amount to calculate fee on (6 decimals for dUSD)
 * @param feeRateBps - Fee rate in basis points using dTRINITY's system (100 = 1 bps, 10000 = 1%, 1000000 = 100%)
 * @returns Fee amount in same decimal precision as input
 */
export function calculateFeeAmount(amount: BigNumberish, feeRateBps: BigNumberish): bigint {
  const amountBigInt = BigInt(amount.toString());
  const feeRateBigInt = BigInt(feeRateBps.toString());

  // Calculate fee using dTRINITY's basis point system: (amount * feeRateBps) / 1000000
  // This matches BasisPointConstants.ONE_HUNDRED_PERCENT_BPS = 1,000,000
  return (amountBigInt * feeRateBigInt) / 1000000n;
}

/**
 * Helper to create test amounts with proper decimal precision
 */
export const TestAmounts = {
  // dUSD amounts (6 decimals)
  dusd: {
    small: 10n ** BigInt(DUSD_DECIMALS - 3), // 0.001 dUSD
    medium: 100n * 10n ** BigInt(DUSD_DECIMALS), // 100 dUSD
    large: 10000n * 10n ** BigInt(DUSD_DECIMALS), // 10,000 dUSD
  },

  // Oracle prices (8 decimals)
  oraclePrice: {
    oneDollar: 10n ** BigInt(ORACLE_DECIMALS), // $1.00
    fiftyDollars: 50n * 10n ** BigInt(ORACLE_DECIMALS), // $50.00
    thousandDollars: 1000n * 10n ** BigInt(ORACLE_DECIMALS), // $1000.00
  },

  // Standard 18-decimal token amounts
  token18: {
    small: 10n ** 15n, // 0.001 tokens
    medium: 100n * 10n ** 18n, // 100 tokens
    large: 10000n * 10n ** 18n, // 10,000 tokens
  },

  // Fee rates in basis points using dTRINITY's system (100 = 1 bps)
  fees: {
    zeroPercent: 0n,
    onePercent: 10000n, // 1% = 10000 (100 bps * 100)
    fivePercent: 50000n, // 5% = 50000 (500 bps * 100)
    maxFee: 100000n, // 10% = 100000 (1000 bps * 100) (max withdrawal fee for dSTAKE)
    hundredPercent: 1000000n, // 100% = 1000000 (10000 bps * 100) (for testing)
  },
};
