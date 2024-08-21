import chai, { assert } from "chai";
import hre from "hardhat";

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
  it("converts between decimals correctly", async function () {
    await standardTestTokenFixture();
    const { testTokenDeployer } = await hre.getNamedAccounts();
    const supplyManager =
      await getTokenSupplyManagerHarnessContract(testTokenDeployer);

    // Convert to fewer decimals
    const convertedAmount =
      await supplyManager.testConvertAmountBetweenDecimals(3e7, 6, 2);
    assert.equal(convertedAmount.toString(), (3e3).toString());

    // Convert to more decimals
    const convertedAmount2 =
      await supplyManager.testConvertAmountBetweenDecimals(1e3, 2, 4);
    assert.equal(convertedAmount2.toString(), (1e5).toString());
  });

  it("issue using collateral", async function () {
    const { testAccount1 } = await hre.getNamedAccounts();
    const collateralSymbol = "SFRAX";
    const receiptSymbol = "DUSD";
    const depositAmount = 100;
    const redeemAmount = 30;

    await standardTestTokenFixture();
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

    // Make sure the testAccount1 has 0 collateralToken and
    // has 100 receiptToken after the transfer
    await assertBalance(testAccount1, collateralSymbol, "0");
    await assertBalance(testAccount1, receiptSymbol, depositAmount.toString());

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

    // Redeem the receipt token to the collateral token with more than the balance
    await chai
      .expect(
        redeemWithApproval(testAccount1, collateralSymbol, receiptSymbol, 1000),
      )
      .to.rejectedWith("ERC20: burn amount exceeds balance");

    // Issue the receipt token from the collateral token with insufficient balance
    await chai
      .expect(
        issueWithApproval(testAccount1, collateralSymbol, receiptSymbol, 1000),
      )
      .to.rejectedWith("ERC20InsufficientBalance");
  });

  it("migrate collateral", async function () {
    const { testTokenDeployer, testAccount1 } = await hre.getNamedAccounts();
    const collateralSymbol = "SFRAX";
    const receiptSymbol = "DUSD";
    const depositAmount = 100;

    await standardTestTokenFixture();
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

    // Make sure the testAccount1 has 0 collateralToken and
    // has 100 receiptToken after the transfer
    await assertBalance(testAccount1, collateralSymbol, "0");
    await assertBalance(testAccount1, receiptSymbol, depositAmount.toString());

    // Make sure cannot migrate the collateral token with non-owner account
    let supplyManager = await getTokenSupplyManagerContract(testAccount1);
    await chai
      .expect(supplyManager.migrateCollateral(testAccount1, 30))
      .to.rejectedWith("OwnableUnauthorizedAccount");

    const testTokenDeployerCollateralBalanceBefore = await getTokenBalance(
      testTokenDeployer,
      collateralSymbol,
    );

    // Make sure can migrate the collateral token with owner account
    supplyManager = await getTokenSupplyManagerContract(testTokenDeployer);
    await supplyManager.migrateCollateral(
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
