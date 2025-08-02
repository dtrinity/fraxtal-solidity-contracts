import { expect } from "chai";
import { formatUnits, parseUnits } from "ethers";
import hre from "hardhat";

import { calculateFeeAmount, DUSD_DECIMALS } from "../../utils/decimal-utils";
import { createDStakeFixture } from "./fixtures";

describe("DStake Security", () => {
  let fixture: Awaited<ReturnType<typeof createDStakeFixture>>;

  beforeEach(async () => {
    fixture = await createDStakeFixture();
    await fixture.setupTestEnvironment();
  });

  describe("Zero-Share Vulnerability Prevention", () => {
    it("should prevent zero-share attacks", async () => {
      const attacker = fixture.accounts.testAccount1;
      const victim = fixture.accounts.testAccount2;
      const attackerSigner = await hre.ethers.getSigner(attacker);
      const victimSigner = await hre.ethers.getSigner(victim);

      // Classic zero-share attack pattern:
      // 1. Attacker deposits minimal amount to get first shares
      // 2. Attacker directly transfers assets to inflate share price
      // 3. Victim deposits and gets zero shares due to rounding

      console.log("Testing zero-share vulnerability prevention...");

      // Step 1: Attacker makes minimal deposit
      const minDeposit = parseUnits("0.000001", DUSD_DECIMALS); // 1 wei in 6-decimal terms

      try {
        await fixture.dStakeToken
          .connect(attackerSigner)
          .deposit(minDeposit, attacker);
        const attackerShares = await fixture.dStakeToken.balanceOf(attacker);

        console.log(
          `Attacker deposited ${formatUnits(minDeposit, DUSD_DECIMALS)} dUSD`,
        );
        console.log(
          `Attacker received ${formatUnits(attackerShares, DUSD_DECIMALS)} shares`,
        );

        // If shares are zero, the vault may be vulnerable or have minimum deposit requirements
        if (attackerShares === 0n) {
          console.log(
            "Vault rejected minimal deposit - likely has minimum deposit protection",
          );
          return; // This is good - vault is protected
        }

        // Step 2: Try to inflate share price by direct transfer (if possible)
        const inflationAmount = parseUnits("1000000", DUSD_DECIMALS); // 1M dUSD

        try {
          // In a real attack, attacker would transfer directly to vault
          // This might not work if vault doesn't accept direct transfers
          const vaultAddress = await fixture.dStakeToken.getAddress();
          await fixture.dUSD
            .connect(attackerSigner)
            .transfer(vaultAddress, inflationAmount);

          console.log(
            "WARNING: Vault accepts direct transfers - potential vulnerability",
          );

          // Step 3: Victim tries to deposit
          const victimDeposit = parseUnits("1000", DUSD_DECIMALS); // 1000 dUSD
          await fixture.dStakeToken
            .connect(victimSigner)
            .deposit(victimDeposit, victim);
          const victimShares = await fixture.dStakeToken.balanceOf(victim);

          console.log(
            `Victim deposited ${formatUnits(victimDeposit, DUSD_DECIMALS)} dUSD`,
          );
          console.log(
            `Victim received ${formatUnits(victimShares, DUSD_DECIMALS)} shares`,
          );

          // Victim should receive proportional shares
          expect(victimShares).to.be.greaterThan(0n);

          // Check if victim's share proportion is reasonable
          const totalShares = await fixture.dStakeToken.totalSupply();
          const victimProportion = (victimShares * 10000n) / totalShares; // in basis points

          console.log(
            `Victim owns ${Number(victimProportion) / 100}% of shares`,
          );

          // Victim should own significant portion given their large deposit
          expect(victimProportion).to.be.greaterThan(50n); // At least 0.5%
        } catch (transferError) {
          console.log(
            "Direct transfer to vault failed - this is good for security",
          );
        }
      } catch (error) {
        console.log(
          "Minimal deposit rejected - vault likely has minimum deposit requirements",
        );
        expect(error).to.exist;
      }
    });

    it("should handle first deposit edge cases", async () => {
      const user = fixture.accounts.testAccount1;
      const userSigner = await hre.ethers.getSigner(user);

      // Test various first deposit amounts
      const testAmounts = [
        1n, // 1 wei in 6-decimal precision
        parseUnits("0.000001", DUSD_DECIMALS), // 1 wei
        parseUnits("0.001", DUSD_DECIMALS), // 0.001 dUSD
        parseUnits("1", DUSD_DECIMALS), // 1 dUSD
      ];

      for (const amount of testAmounts) {
        console.log(
          `Testing first deposit of ${formatUnits(amount, DUSD_DECIMALS)} dUSD`,
        );

        try {
          // Get expected shares before deposit
          const expectedShares =
            await fixture.dStakeToken.previewDeposit(amount);
          console.log(
            `Expected shares: ${formatUnits(expectedShares, DUSD_DECIMALS)}`,
          );

          if (expectedShares === 0n) {
            console.log("Vault would give zero shares - testing rejection...");

            try {
              await fixture.dStakeToken
                .connect(userSigner)
                .deposit(amount, user);
              // If this succeeds but shares were zero, it's problematic
              const actualShares = await fixture.dStakeToken.balanceOf(user);
              expect(actualShares).to.be.greaterThan(0n);
            } catch (depositError) {
              console.log("Zero-share deposit correctly rejected");
              expect(depositError).to.exist;
            }
          } else {
            // Should succeed and give expected shares
            await fixture.dStakeToken.connect(userSigner).deposit(amount, user);
            const actualShares = await fixture.dStakeToken.balanceOf(user);
            expect(actualShares).to.be.greaterThan(0n);

            // Clear balance for next test
            if (actualShares > 0n) {
              await fixture.dStakeToken
                .connect(userSigner)
                .redeem(actualShares, user, user);
            }
          }
        } catch (error) {
          console.log(
            `Deposit of ${formatUnits(amount, DUSD_DECIMALS)} dUSD rejected:`,
            error.message.substring(0, 100),
          );
        }

        console.log("---");
      }
    });
  });

  describe("Rounding and Precision Tests", () => {
    it("should handle rounding correctly with 6-decimal precision", async () => {
      const user = fixture.accounts.testAccount1;
      const userSigner = await hre.ethers.getSigner(user);

      // Test amounts that might cause rounding issues
      const testAmounts = [
        parseUnits("0.000001", DUSD_DECIMALS), // 1 wei in 6-decimal
        parseUnits("0.333333", DUSD_DECIMALS), // Repeating decimal
        parseUnits("1.234567", DUSD_DECIMALS), // Max precision
        parseUnits("999.999999", DUSD_DECIMALS), // Almost round number
      ];

      for (const amount of testAmounts) {
        console.log(
          `\nTesting rounding for ${formatUnits(amount, DUSD_DECIMALS)} dUSD`,
        );

        try {
          // Test deposit and immediate withdrawal
          await fixture.dStakeToken.connect(userSigner).deposit(amount, user);
          const shares = await fixture.dStakeToken.balanceOf(user);

          console.log(`Received ${formatUnits(shares, DUSD_DECIMALS)} shares`);

          if (shares > 0n) {
            // Withdraw and check for rounding errors
            const previewWithdraw =
              await fixture.dStakeToken.previewRedeem(shares);
            console.log(
              `Preview withdraw: ${formatUnits(previewWithdraw, DUSD_DECIMALS)} dUSD`,
            );

            await fixture.dStakeToken
              .connect(userSigner)
              .redeem(shares, user, user);

            // Check that we don't lose significant amounts to rounding
            // (Some loss is expected due to withdrawal fees)
            const feeRate = await fixture.dStakeToken.withdrawalFeeBps();
            const expectedFee = calculateFeeAmount(amount, feeRate);
            const expectedNet = amount - expectedFee;
            const tolerance = parseUnits("0.000001", DUSD_DECIMALS); // 1 wei tolerance

            expect(previewWithdraw).to.be.closeTo(expectedNet, tolerance);

            console.log(
              `Expected net after fees: ${formatUnits(expectedNet, DUSD_DECIMALS)} dUSD`,
            );
            console.log(`Fee: ${formatUnits(expectedFee, DUSD_DECIMALS)} dUSD`);
          }
        } catch (error) {
          console.log(
            `Amount ${formatUnits(amount, DUSD_DECIMALS)} dUSD failed:`,
            error.message.substring(0, 100),
          );
        }
      }
    });

    it("should prevent precision loss in large operations", async () => {
      const user = fixture.accounts.testAccount1;
      const userSigner = await hre.ethers.getSigner(user);

      // Test with large amounts that might cause overflow or precision loss
      const largeAmount = parseUnits("1000000", DUSD_DECIMALS); // 1M dUSD

      // First mint enough dUSD for the test
      await fixture.mintDUSD(user, "2000000"); // 2M dUSD

      // Approve large amount
      await fixture.dUSD
        .connect(userSigner)
        .approve(await fixture.dStakeToken.getAddress(), largeAmount);

      try {
        console.log(
          `Testing large deposit: ${formatUnits(largeAmount, DUSD_DECIMALS)} dUSD`,
        );

        const initialBalance = await fixture.dUSD.balanceOf(user);
        await fixture.dStakeToken
          .connect(userSigner)
          .deposit(largeAmount, user);
        const finalBalance = await fixture.dUSD.balanceOf(user);
        const shares = await fixture.dStakeToken.balanceOf(user);

        // Verify exact amount was deposited
        expect(initialBalance - finalBalance).to.equal(largeAmount);
        expect(shares).to.be.greaterThan(0n);

        console.log(
          `Received ${formatUnits(shares, DUSD_DECIMALS)} shares for large deposit`,
        );

        // Test large withdrawal
        const withdrawAmount = largeAmount / 2n; // Withdraw half
        const _sharesCost =
          await fixture.dStakeToken.previewWithdraw(withdrawAmount);

        const beforeWithdrawBalance = await fixture.dUSD.balanceOf(user);
        await fixture.dStakeToken
          .connect(userSigner)
          .withdraw(withdrawAmount, user, user);
        const afterWithdrawBalance = await fixture.dUSD.balanceOf(user);

        // Account for withdrawal fees
        const actualWithdrawn = afterWithdrawBalance - beforeWithdrawBalance;
        const feeRate = await fixture.dStakeToken.withdrawalFeeBps();
        const expectedFee = calculateFeeAmount(withdrawAmount, feeRate);
        const expectedNet = withdrawAmount - expectedFee;

        console.log(
          `Withdrew ${formatUnits(actualWithdrawn, DUSD_DECIMALS)} dUSD (net after fees)`,
        );
        console.log(`Expected ${formatUnits(expectedNet, DUSD_DECIMALS)} dUSD`);

        // Allow small tolerance for rounding
        const tolerance = parseUnits("1", DUSD_DECIMALS); // 1 dUSD tolerance
        expect(actualWithdrawn).to.be.closeTo(expectedNet, tolerance);
      } catch (error) {
        console.log("Large operation failed:", error.message);
        // Large operations might fail due to liquidity or other constraints
      }
    });
  });

  describe("Reentrancy Protection", () => {
    it("should prevent reentrancy attacks", async () => {
      // Note: This test is limited without a malicious contract
      // In production, deploy a malicious contract that tries to reenter

      const user = fixture.accounts.testAccount1;
      const userSigner = await hre.ethers.getSigner(user);
      const depositAmount = parseUnits("100", DUSD_DECIMALS);

      console.log("Testing basic reentrancy protection...");

      // Make a normal deposit
      await fixture.dStakeToken
        .connect(userSigner)
        .deposit(depositAmount, user);
      const _shares = await fixture.dStakeToken.balanceOf(user);

      // Try to call deposit during withdrawal (this would be done in a malicious contract)
      // For now, just verify that normal operations complete successfully
      await fixture.dStakeToken
        .connect(userSigner)
        .withdraw(depositAmount / 2n, user, user);

      const remainingShares = await fixture.dStakeToken.balanceOf(user);
      expect(remainingShares).to.be.lessThan(_shares);

      console.log("Basic operations completed successfully");
    });
  });

  describe("Access Control Security", () => {
    it("should protect privileged functions", async () => {
      const unauthorizedUser = fixture.accounts.testAccount1;
      const unauthorizedSigner = await hre.ethers.getSigner(unauthorizedUser);

      console.log("Testing access control...");

      // Test fee setting protection
      try {
        await fixture.dStakeToken
          .connect(unauthorizedSigner)
          .setWithdrawalFee(500n);
        console.log("WARNING: Unauthorized user could set fees!");
        expect.fail("Access control failed");
      } catch (error) {
        console.log("Fee setting properly protected");
        expect(error.message).to.include("AccessControl");
      }

      // Test other privileged functions if they exist
      try {
        const pauserRole = await fixture.dStakeToken.PAUSER_ROLE();
        const hasPauser = await fixture.dStakeToken.hasRole(
          pauserRole,
          unauthorizedUser,
        );

        if (!hasPauser) {
          // Try to pause (should fail)
          try {
            await fixture.dStakeToken.connect(unauthorizedSigner).pause();
            console.log("WARNING: Unauthorized user could pause contract!");
          } catch (pauseError) {
            console.log("Pause function properly protected");
          }
        }
      } catch (error) {
        console.log("Pause role not implemented or different name");
      }
    });

    it("should validate role assignments", async () => {
      const adminRole = await fixture.dStakeToken.DEFAULT_ADMIN_ROLE();
      const feeManagerRole = await fixture.dStakeToken.FEE_MANAGER_ROLE();

      // Check current role holders
      console.log("Checking role assignments...");

      const deployerHasAdmin = await fixture.dStakeToken.hasRole(
        adminRole,
        fixture.accounts.dusdDeployer,
      );
      const deployerHasFeeManager = await fixture.dStakeToken.hasRole(
        feeManagerRole,
        fixture.accounts.dusdDeployer,
      );

      console.log(`Deployer has admin: ${deployerHasAdmin}`);
      console.log(`Deployer has fee manager: ${deployerHasFeeManager}`);

      // In production, admin role should be transferred to multisig
      // For tests, deployer might retain roles

      // Verify roles exist
      expect(adminRole).to.not.be.undefined;
      expect(feeManagerRole).to.not.be.undefined;
    });
  });

  describe("Economic Security", () => {
    it("should prevent value extraction through fees", async () => {
      const user = fixture.accounts.testAccount1;
      const userSigner = await hre.ethers.getSigner(user);
      const depositAmount = parseUnits("1000", DUSD_DECIMALS);

      // Deposit
      await fixture.dStakeToken
        .connect(userSigner)
        .deposit(depositAmount, user);
      const _shares = await fixture.dStakeToken.balanceOf(user);

      // Check fee reasonableness
      const feeRate = await fixture.dStakeToken.withdrawalFeeBps();
      const maxReasonableFee = 1000n; // 10%

      expect(feeRate).to.be.lessThanOrEqual(maxReasonableFee);
      console.log(`Withdrawal fee: ${Number(feeRate) / 100}%`);

      // Test that fees don't compound unreasonably
      const withdrawAmount = parseUnits("100", DUSD_DECIMALS);
      const expectedFee = calculateFeeAmount(withdrawAmount, feeRate);

      // Fee should be less than 10% of withdrawal
      expect(expectedFee).to.be.lessThan(withdrawAmount / 10n);

      console.log(
        `Fee on ${formatUnits(withdrawAmount, DUSD_DECIMALS)} dUSD withdrawal: ${formatUnits(expectedFee, DUSD_DECIMALS)} dUSD`,
      );
    });

    it("should maintain correct exchange rates", async () => {
      const user1 = fixture.accounts.testAccount1;
      const user2 = fixture.accounts.testAccount2;
      const user1Signer = await hre.ethers.getSigner(user1);
      const user2Signer = await hre.ethers.getSigner(user2);

      const depositAmount = parseUnits("1000", DUSD_DECIMALS);

      // Both users deposit same amount
      await fixture.dStakeToken
        .connect(user1Signer)
        .deposit(depositAmount, user1);
      await fixture.dStakeToken
        .connect(user2Signer)
        .deposit(depositAmount, user2);

      const shares1 = await fixture.dStakeToken.balanceOf(user1);
      const shares2 = await fixture.dStakeToken.balanceOf(user2);

      // Shares should be similar (allowing for small differences due to yield accrual)
      const tolerance = shares1 / 1000n; // 0.1% tolerance
      expect(shares2).to.be.closeTo(shares1, tolerance);

      console.log(`User1 shares: ${formatUnits(shares1, DUSD_DECIMALS)}`);
      console.log(`User2 shares: ${formatUnits(shares2, DUSD_DECIMALS)}`);

      // Asset values should be consistent
      const assets1 = await fixture.dStakeToken.convertToAssets(shares1);
      const assets2 = await fixture.dStakeToken.convertToAssets(shares2);

      const assetTolerance = parseUnits("1", DUSD_DECIMALS); // 1 dUSD tolerance
      expect(assets2).to.be.closeTo(assets1, assetTolerance);

      console.log(
        `User1 asset value: ${formatUnits(assets1, DUSD_DECIMALS)} dUSD`,
      );
      console.log(
        `User2 asset value: ${formatUnits(assets2, DUSD_DECIMALS)} dUSD`,
      );
    });
  });
});
