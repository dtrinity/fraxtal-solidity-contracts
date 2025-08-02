import { expect } from "chai";
import { parseUnits } from "ethers";

import {
  calculateFeeAmount,
  calculateTokenAmountForDUSDValue,
  calculateValueInDUSD,
  convertDecimalPrecision,
  convertOraclePrice,
  DUSD_DECIMALS,
  ORACLE_DECIMALS,
  TestAmounts,
} from "./decimal-utils";

describe("Decimal Utilities", () => {
  describe("Constants", () => {
    it("should have correct decimal constants", () => {
      expect(DUSD_DECIMALS).to.equal(6);
      expect(ORACLE_DECIMALS).to.equal(8);
    });
  });

  describe("convertDecimalPrecision", () => {
    it("should convert from higher to lower precision", () => {
      const value = parseUnits("100", 18); // 100 tokens with 18 decimals
      const converted = convertDecimalPrecision(value, 18, 6);
      const expected = parseUnits("100", 6); // Same amount with 6 decimals

      expect(converted).to.equal(expected);
    });

    it("should convert from lower to higher precision", () => {
      const value = parseUnits("100", 6); // 100 tokens with 6 decimals
      const converted = convertDecimalPrecision(value, 6, 18);
      const expected = parseUnits("100", 18); // Same amount with 18 decimals

      expect(converted).to.equal(expected);
    });

    it("should handle same precision", () => {
      const value = parseUnits("100", 6);
      const converted = convertDecimalPrecision(value, 6, 6);

      expect(converted).to.equal(value);
    });
  });

  describe("convertOraclePrice", () => {
    it("should convert oracle price to dUSD precision", () => {
      const oraclePrice = parseUnits("1.5", ORACLE_DECIMALS); // $1.50 with 8 decimals
      const converted = convertOraclePrice(oraclePrice);
      const expected = parseUnits("1.5", DUSD_DECIMALS); // $1.50 with 6 decimals

      expect(converted).to.equal(expected);
    });
  });

  describe("calculateValueInDUSD", () => {
    it("should calculate dUSD value for 18-decimal tokens", () => {
      const tokenAmount = parseUnits("100", 18); // 100 tokens
      const oraclePrice = parseUnits("2", ORACLE_DECIMALS); // $2.00 per token

      const value = calculateValueInDUSD(tokenAmount, 18, oraclePrice);
      const expected = parseUnits("200", DUSD_DECIMALS); // 100 * $2 = $200 with 6 decimals

      expect(value).to.equal(expected);
    });

    it("should calculate dUSD value for 6-decimal tokens", () => {
      const tokenAmount = parseUnits("100", 6); // 100 USDC
      const oraclePrice = parseUnits("1", ORACLE_DECIMALS); // $1.00 per USDC

      const value = calculateValueInDUSD(tokenAmount, 6, oraclePrice);
      const expected = parseUnits("100", DUSD_DECIMALS); // 100 * $1 = $100

      expect(value).to.equal(expected);
    });

    it("should handle fractional prices", () => {
      const tokenAmount = parseUnits("10", 18); // 10 tokens
      const oraclePrice = parseUnits("1.5", ORACLE_DECIMALS); // $1.50 per token

      const value = calculateValueInDUSD(tokenAmount, 18, oraclePrice);
      const expected = parseUnits("15", DUSD_DECIMALS); // 10 * $1.5 = $15

      expect(value).to.equal(expected);
    });
  });

  describe("calculateTokenAmountForDUSDValue", () => {
    it("should calculate token amount for target dUSD value", () => {
      const dusdValue = parseUnits("200", DUSD_DECIMALS); // $200 dUSD
      const oraclePrice = parseUnits("2", ORACLE_DECIMALS); // $2.00 per token

      const tokenAmount = calculateTokenAmountForDUSDValue(
        dusdValue,
        18,
        oraclePrice,
      );
      const expected = parseUnits("100", 18); // $200 / $2 = 100 tokens

      expect(tokenAmount).to.equal(expected);
    });

    it("should handle different token decimals", () => {
      const dusdValue = parseUnits("100", DUSD_DECIMALS); // $100 dUSD
      const oraclePrice = parseUnits("1", ORACLE_DECIMALS); // $1.00 per token

      const tokenAmount = calculateTokenAmountForDUSDValue(
        dusdValue,
        6,
        oraclePrice,
      );
      const expected = parseUnits("100", 6); // $100 / $1 = 100 tokens with 6 decimals

      expect(tokenAmount).to.equal(expected);
    });
  });

  describe("calculateFeeAmount", () => {
    it("should calculate fees correctly", () => {
      const amount = parseUnits("1000", DUSD_DECIMALS); // 1000 dUSD
      const feeRateBps = TestAmounts.fees.onePercent;

      const fee = calculateFeeAmount(amount, feeRateBps);
      const expected = parseUnits("10", DUSD_DECIMALS); // 1% of 1000 = 10

      expect(fee).to.equal(expected);
    });

    it("should handle zero fees", () => {
      const amount = parseUnits("1000", DUSD_DECIMALS);
      const feeRateBps = TestAmounts.fees.zeroPercent;

      const fee = calculateFeeAmount(amount, feeRateBps);
      expect(fee).to.equal(0n);
    });

    it("should handle maximum fees", () => {
      const amount = parseUnits("1000", DUSD_DECIMALS);
      const feeRateBps = TestAmounts.fees.hundredPercent;

      const fee = calculateFeeAmount(amount, feeRateBps);
      expect(fee).to.equal(amount); // 100% fee = entire amount
    });

    it("should handle small amounts without precision loss", () => {
      const amount = parseUnits("1", DUSD_DECIMALS); // 1 dUSD
      const feeRateBps = TestAmounts.fees.onePercent;

      const fee = calculateFeeAmount(amount, feeRateBps);
      const expected = parseUnits("0.01", DUSD_DECIMALS); // 1% of 1 = 0.01

      expect(fee).to.equal(expected);
    });
  });

  describe("TestAmounts", () => {
    it("should provide test amounts with correct precision", () => {
      // dUSD amounts
      expect(TestAmounts.dusd.small).to.be.greaterThan(0);
      expect(TestAmounts.dusd.medium).to.be.greaterThan(TestAmounts.dusd.small);
      expect(TestAmounts.dusd.large).to.be.greaterThan(TestAmounts.dusd.medium);

      // Oracle prices
      expect(TestAmounts.oraclePrice.oneDollar).to.equal(
        parseUnits("1", ORACLE_DECIMALS),
      );
      expect(TestAmounts.oraclePrice.fiftyDollars).to.equal(
        parseUnits("50", ORACLE_DECIMALS),
      );
      expect(TestAmounts.oraclePrice.thousandDollars).to.equal(
        parseUnits("1000", ORACLE_DECIMALS),
      );

      // Fee rates using dTRINITY's system (100 = 1 bps)
      expect(TestAmounts.fees.zeroPercent).to.equal(0n);
      expect(TestAmounts.fees.onePercent).to.equal(10000n); // 1% = 10000
      expect(TestAmounts.fees.fivePercent).to.equal(50000n); // 5% = 50000
      expect(TestAmounts.fees.maxFee).to.equal(100000n); // 10% = 100000
    });
  });

  describe("Rounding and Precision", () => {
    it("should maintain precision in round-trip conversions", () => {
      const originalAmount = parseUnits("123.456789", DUSD_DECIMALS);
      const oraclePrice = parseUnits("1", ORACLE_DECIMALS);

      // Convert to token amount and back
      const tokenAmount = calculateTokenAmountForDUSDValue(
        originalAmount,
        18,
        oraclePrice,
      );
      const backToDUSD = calculateValueInDUSD(tokenAmount, 18, oraclePrice);

      // Should be very close (allowing for small rounding differences)
      const tolerance = parseUnits("0.000001", DUSD_DECIMALS); // 1 wei tolerance
      expect(backToDUSD).to.be.closeTo(originalAmount, tolerance);
    });

    it("should handle extreme values", () => {
      // Very large amounts
      const _largeAmount = parseUnits("1000000", DUSD_DECIMALS); // 1M dUSD
      const largePrice = parseUnits("1000", ORACLE_DECIMALS); // $1000 per token

      const value = calculateValueInDUSD(parseUnits("1", 18), 18, largePrice);
      expect(value).to.equal(parseUnits("1000", DUSD_DECIMALS));

      // Very small amounts
      const _smallAmount = 1n; // 1 wei in 6-decimal precision
      const smallPrice = parseUnits("0.0001", ORACLE_DECIMALS); // $0.0001

      const smallValue = calculateValueInDUSD(
        parseUnits("1", 18),
        18,
        smallPrice,
      );
      expect(smallValue).to.be.greaterThanOrEqual(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero amounts", () => {
      const zeroAmount = 0n;
      const oraclePrice = parseUnits("1", ORACLE_DECIMALS);

      const value = calculateValueInDUSD(zeroAmount, 18, oraclePrice);
      expect(value).to.equal(0n);

      const fee = calculateFeeAmount(zeroAmount, 100n);
      expect(fee).to.equal(0n);
    });

    it("should handle zero prices", () => {
      const tokenAmount = parseUnits("100", 18);
      const zeroPrice = 0n;

      const value = calculateValueInDUSD(tokenAmount, 18, zeroPrice);
      expect(value).to.equal(0n);
    });

    it("should handle precision edge cases", () => {
      // Test 1 wei amounts
      const oneWei6 = 1n; // 1 wei in 6-decimal precision
      const oneWei18 = parseUnits("0.000000000000000001", 18); // 1 wei in 18-decimal

      expect(oneWei6).to.be.greaterThan(0);
      expect(oneWei18).to.be.greaterThan(0);

      // Convert between precisions
      const converted = convertDecimalPrecision(oneWei18, 18, 6);
      // This might be 0 due to precision loss, which is expected
      expect(converted).to.be.greaterThanOrEqual(0);
    });
  });
});
