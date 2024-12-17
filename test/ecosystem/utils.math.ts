import { assert } from "chai";

/**
 * Assert that the given value is approximately equal to the expected value
 * - For `bigint` values
 *
 * @param value - The value to check
 * @param expectedValue - The expected value
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export function assertBigIntEqualApproximately(
  value: bigint,
  expectedValue: bigint,
  tolerance: number = 1e-6,
): void {
  const toleranceBigInt = BigInt(Math.floor(Number(expectedValue) * tolerance));

  assert(
    value >= expectedValue - toleranceBigInt &&
      value <= expectedValue + toleranceBigInt,
    `Value is not within tolerance. Expected: ${expectedValue}, Actual: ${value}, tolerance: ${toleranceBigInt}`,
  );
}

/**
 * Assert that the given value is approximately equal to the expected value
 * - For `number` values
 *
 * @param value - The value to check
 * @param expectedValue - The expected value
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export function assertNumberEqualApproximately(
  value: number,
  expectedValue: number,
  tolerance: number = 1e-6,
): void {
  const toleranceValue = Math.floor(expectedValue * tolerance);

  assert(
    value >= expectedValue - toleranceValue &&
      value <= expectedValue + toleranceValue,
    `Value is not within tolerance. Expected: ${expectedValue}, Actual: ${value}, tolerance: ${toleranceValue}`,
  );
}
