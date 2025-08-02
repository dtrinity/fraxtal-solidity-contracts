import { assert, expect } from "chai";
import hre from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  MintableERC20,
  TokenSupplyManager,
  TokenSupplyManagerHarness,
} from "../../typechain-types";
import {
  getTokenAmount,
  getTokenBalance,
  transferTokenToAccount,
} from "../ecosystem/utils.token";
import { standardTestTokenFixture } from "./fixtures";
import {
  assertBalance,
  getTokenSupplyManagerContract,
  getTokenSupplyManagerHarnessContract,
  issueWithApproval,
  redeemWithApproval,
} from "./utils";

describe("Test TokenSupplyManager", function () {
  // Common variables used across tests
  let _supplyManager: TokenSupplyManager;
  let supplyManagerHarness: TokenSupplyManagerHarness;
  let testTokenDeployer: Address;
  let testAccount1: Address;
  let _dexDeployer: Address;
  let collateralSymbol: string;
  let receiptSymbol: string;
  let _collateralContract: MintableERC20;
  let _receiptContract: MintableERC20;

  beforeEach(async function () {
    // Setup the test fixture
    await standardTestTokenFixture();

    // Get named accounts
    ({
      testTokenDeployer,
      testAccount1,
      dexDeployer: _dexDeployer,
    } = await hre.getNamedAccounts());

    // Initialize contract instances
    _supplyManager = await getTokenSupplyManagerContract(testTokenDeployer);
    supplyManagerHarness =
      await getTokenSupplyManagerHarnessContract(testTokenDeployer);

    // Set default token symbols
    collateralSymbol = "SFRAX";
    receiptSymbol = "dUSD";
  });

  describe("Decimal conversion", () => {
    it("converts between decimals correctly", async function () {
      // Convert to fewer decimals
      const convertedAmount =
        await supplyManagerHarness.testConvertAmountBetweenDecimals(3e7, 6, 2);
      assert.equal(convertedAmount.toString(), (3e3).toString());

      // Convert to more decimals
      const convertedAmount2 =
        await supplyManagerHarness.testConvertAmountBetweenDecimals(1e3, 2, 4);
      assert.equal(convertedAmount2.toString(), (1e5).toString());
    });
  });

  describe("Token issuance and redemption", () => {
    const depositAmount = 100;
    const redeemAmount = 30;

    beforeEach(async function () {
      // Prepare the test for issuing tokens
      await prepareIssueingTest(
        collateralSymbol,
        receiptSymbol,
        depositAmount,
        testAccount1,
      );
    });

    it("issues and redeems tokens correctly", async function () {
      // Issue the receipt token from the collateral token
      await issueWithApproval(
        testAccount1,
        collateralSymbol,
        receiptSymbol,
        depositAmount,
      );

      // Make sure the testAccount1 has 0 collateralToken and
      // has 100 receiptToken after the transfer
      await assertBalance(testAccount1, collateralSymbol, "0");
      await assertBalance(
        testAccount1,
        receiptSymbol,
        depositAmount.toString(),
      );

      // Redeem the receipt token to the collateral token
      await redeemWithApproval(
        testAccount1,
        collateralSymbol,
        receiptSymbol,
        redeemAmount,
      );

      // Make sure the testAccount1 has 30 collateralToken and 70 receiptToken after the redemption
      await assertBalance(
        testAccount1,
        collateralSymbol,
        redeemAmount.toString(),
      );
      await assertBalance(
        testAccount1,
        receiptSymbol,
        (depositAmount - redeemAmount).toString(),
      );
    });

    it("fails when redeeming more than balance", async function () {
      // Issue tokens first
      await issueWithApproval(
        testAccount1,
        collateralSymbol,
        receiptSymbol,
        depositAmount,
      );

      // Redeem the receipt token to the collateral token with more than the balance
      await expect(
        redeemWithApproval(testAccount1, collateralSymbol, receiptSymbol, 1000),
      ).to.be.rejectedWith("ERC20: burn amount exceeds balance");
    });

    it("fails when issuing with insufficient balance", async function () {
      // Issue the receipt token from the collateral token with insufficient balance
      await expect(
        issueWithApproval(testAccount1, collateralSymbol, receiptSymbol, 1000),
      ).to.be.rejectedWith("ERC20InsufficientBalance");
    });
  });

  describe("Collateral migration", () => {
    const depositAmount = 100;

    beforeEach(async function () {
      // Prepare the test for issuing tokens
      await prepareIssueingTest(
        collateralSymbol,
        receiptSymbol,
        depositAmount,
        testAccount1,
      );

      // Issue the receipt token from the collateral token
      await issueWithApproval(
        testAccount1,
        collateralSymbol,
        receiptSymbol,
        depositAmount,
      );
    });

    it("prevents non-owner from migrating collateral", async function () {
      // Make sure cannot migrate the collateral token with non-owner account
      const nonOwnerSupplyManager =
        await getTokenSupplyManagerContract(testAccount1);
      await expect(
        nonOwnerSupplyManager.migrateCollateral(testAccount1, 30),
      ).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("allows owner to migrate collateral", async function () {
      const testTokenDeployerCollateralBalanceBefore = await getTokenBalance(
        testTokenDeployer,
        collateralSymbol,
      );

      // Make sure can migrate the collateral token with owner account
      const ownerSupplyManager =
        await getTokenSupplyManagerContract(testTokenDeployer);
      await ownerSupplyManager.migrateCollateral(
        testTokenDeployer,
        await getTokenAmount("30", collateralSymbol),
      );

      const testTokenDeployerCollateralBalanceAfter = await getTokenBalance(
        testTokenDeployer,
        collateralSymbol,
      );

      // Make sure the testTokenDeployer increases by 30 collateralToken after the migration
      assert.equal(
        testTokenDeployerCollateralBalanceAfter -
          testTokenDeployerCollateralBalanceBefore,
        await getTokenAmount("30", collateralSymbol),
      );
    });
  });
});

/**
 * Prepare the test for issueing the token
 *
 * @param collateralSymbol - The symbol of the collateral token
 * @param receiptSymbol - The symbol of the receipt token
 * @param initTestAccountAmount - The initial amount of the test account
 * @param testAccount - The address of the test account
 */
async function prepareIssueingTest(
  collateralSymbol: string,
  receiptSymbol: string,
  initTestAccountAmount: number,
  testAccount: string,
): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();

  // Make sure the testAccount1 has 0 balance before the transfer
  await assertBalance(testAccount, collateralSymbol, "0");
  await assertBalance(testAccount, receiptSymbol, "0");

  await transferTokenToAccount(
    dexDeployer,
    testAccount,
    collateralSymbol,
    initTestAccountAmount,
  );

  // Make sure the testAccount1 has 100 collateralToken after the transfer
  await assertBalance(
    testAccount,
    collateralSymbol,
    initTestAccountAmount.toString(),
  );
  await assertBalance(testAccount, receiptSymbol, "0");
}
