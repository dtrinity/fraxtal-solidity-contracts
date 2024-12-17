import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { DLoopVaultBase } from "../../typechain-types";
import { ONE_BPS_UNIT } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { standardDLoopUniswapV3Fixture } from "./DLoop.fixtures";
import { setMockStaticOracleWrapperPrice } from "./utils.dex";
import {
  assertCheckIsTooImbalanced,
  assertCurrentLeverageBps,
  assertSharesBalance,
  assertTotalAssetAndSupply,
  decreaseLeverageWithApproval,
  depositWithApprovalToDLoop,
  getDLoopVaultUniswapV3Contract,
  increaseLeverageWithApproval,
  mintWithApprovalToDLoop,
  redeemWithApprovalFromDLoop,
  withdrawWithApprovalFromDLoop,
} from "./utils.dloop";
import { assertUserLendingSupplyAndDebtBalance } from "./utils.lbp";
import {
  assertTokenBalance,
  fillUpAccountBalance,
  getTokenContractForSymbol,
} from "./utils.token";

describe("DLoopVaultUniswapV3 via DLoopVaultBase", () => {
  let dLoopVaultContract: DLoopVaultBase;
  let underlyingTokenInfo: TokenInfo;
  let dusdInfo: TokenInfo;
  let testAccount1: Address;

  const underlyingTokenSymbol = "SFRAX";
  const dusdSymbol = "DUSD";
  const targetLeverageBps = 300 * 100 * ONE_BPS_UNIT; // 3x leverage

  beforeEach(async function () {
    await standardDLoopUniswapV3Fixture();

    ({ testAccount1 } = await getNamedAccounts());

    dLoopVaultContract = await getDLoopVaultUniswapV3Contract(
      hre,
      underlyingTokenSymbol,
      targetLeverageBps,
      testAccount1,
    );

    ({ tokenInfo: underlyingTokenInfo } = await getTokenContractForSymbol(
      testAccount1,
      underlyingTokenSymbol,
    ));
    ({ tokenInfo: dusdInfo } = await getTokenContractForSymbol(
      testAccount1,
      dusdSymbol,
    ));

    // Fill up account balances
    await fillUpAccountBalance(testAccount1, underlyingTokenSymbol, 1000);
    await fillUpAccountBalance(testAccount1, dusdSymbol, 1000);

    // Set initial mock oracle price
    // await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 1.25);
  });

  describe("Base information", () => {
    it("should have correct base information", async function () {
      assert.equal(await dLoopVaultContract.getDUSDAddress(), dusdInfo.address);
      assert.equal(
        await dLoopVaultContract.getUnderlyingAssetAddress(),
        underlyingTokenInfo.address,
      );
      assert.equal(
        await dLoopVaultContract.TARGET_LEVERAGE_BPS(),
        BigInt(targetLeverageBps),
      );
    });
  });

  describe("Deposit and withdraw", () => {
    it("should allow deposit and withdraw", async function () {
      // Skip this test for now
      this.skip(); // TODO: Fix this test after finishing the Curve integration for dLOOP

      const depositAmount = 100;
      const withdrawAmount = 10;
      const dLoopVaultAddress = await dLoopVaultContract.getAddress();

      // Check initial state
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        0,
        dusdInfo.address,
        0,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 0n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertTotalAssetAndSupply(dLoopVaultContract, 0, 0);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 0);
      await assertTokenBalance(testAccount1, underlyingTokenSymbol, 1000);

      // Deposit
      await depositWithApprovalToDLoop(
        dLoopVaultContract,
        underlyingTokenSymbol,
        testAccount1,
        depositAmount,
      );

      // Check post-deposit state
      await assertTotalAssetAndSupply(dLoopVaultContract, 97.5390096, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 3075692n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalance(testAccount1, underlyingTokenSymbol, 900);
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        300,
        dusdInfo.address,
        253.076238,
      );

      // Withdraw
      await withdrawWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        withdrawAmount,
      );

      // Check post-withdraw state
      await assertTotalAssetAndSupply(
        dLoopVaultContract,
        83.085998264,
        89.74769167637724,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 3075692n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(
        testAccount1,
        dLoopVaultAddress,
        89.74769167637724,
      );
      await assertTokenBalance(
        testAccount1,
        underlyingTokenSymbol,
        914.2715117735172,
      );
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        255.546988666912046682,
        dusdInfo.address,
        215.576238,
      );

      // Withdraw again
      await withdrawWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        withdrawAmount * 2,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 3075692n);
      await assertTokenBalance(
        testAccount1,
        underlyingTokenSymbol,
        942.7559312622745,
      );

      // Withdraw again
      await withdrawWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        withdrawAmount * 2,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 3075693n);

      // Withdraw again
      await withdrawWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        withdrawAmount,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 3075695n);

      await assertTotalAssetAndSupply(
        dLoopVaultContract,
        10.82094856,
        25.980029718331988,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 3075695n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(
        testAccount1,
        dLoopVaultAddress,
        25.980029718331988,
      );
      await assertTokenBalance(
        testAccount1,
        underlyingTokenSymbol,
        985.3357586284171,
      );
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        33.281938964453478701,
        dusdInfo.address,
        28.076238,
      );

      // Withdraw again
      await withdrawWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        withdrawAmount / 1.1,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 3075696n);
      await assertTokenBalance(
        testAccount1,
        underlyingTokenSymbol,
        994.773964054766,
      );
    });
  });

  describe("Mint and redeem", () => {
    it("should allow mint and redeem", async function () {
      // Skip this test for now
      this.skip(); // TODO: Fix this test after finishing the Curve integration for dLOOP

      const mintShares = 100;
      const redeemShares = 10;
      const dLoopVaultAddress = await dLoopVaultContract.getAddress();

      // Check initial state
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        0,
        dusdInfo.address,
        0,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 0n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertTotalAssetAndSupply(dLoopVaultContract, 0, 0);

      // Mint
      await mintWithApprovalToDLoop(
        dLoopVaultContract,
        underlyingTokenSymbol,
        testAccount1,
        mintShares,
      );

      // Check post-mint state
      await assertTotalAssetAndSupply(dLoopVaultContract, 97.5390096, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 3075692n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalance(testAccount1, underlyingTokenSymbol, 900);
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        300,
        dusdInfo.address,
        253.076238,
      );

      // Redeem
      await redeemWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        redeemShares,
      );

      // Check post-redeem state
      await assertTotalAssetAndSupply(dLoopVaultContract, 76.569553736, 90);
      await assertCurrentLeverageBps(dLoopVaultContract, 3261986n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 90);
      await assertTokenBalance(
        testAccount1,
        underlyingTokenSymbol,
        920.792657296688980502,
      );
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        249.768841737821551383,
        dusdInfo.address,
        216.49911,
      );

      // Redeem all
      await redeemWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        mintShares - redeemShares,
      );

      // Check final state
      await assertTotalAssetAndSupply(dLoopVaultContract, 0, 0);
      await assertCurrentLeverageBps(dLoopVaultContract, 0n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 0);
      await assertTokenBalance(
        testAccount1,
        underlyingTokenSymbol,
        995.934727053528,
      );
      await assertUserLendingSupplyAndDebtBalance(
        dLoopVaultAddress,
        underlyingTokenInfo.address,
        0,
        dusdInfo.address,
        0,
      );
    });
  });

  describe("Leverage adjustment", () => {
    it("should allow increase and decrease leverage", async function () {
      // Skip this test for now
      this.skip(); // TODO: Fix this test after finishing the Curve integration for dLOOP

      const depositAmount = 100;
      const dLoopVaultAddress = await dLoopVaultContract.getAddress();

      // Initial deposit
      await depositWithApprovalToDLoop(
        dLoopVaultContract,
        underlyingTokenSymbol,
        testAccount1,
        depositAmount,
      );

      // Decrease oracle price
      await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 1.0);

      // Check imbalanced state
      await assertCurrentLeverageBps(dLoopVaultContract, 6393349n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, true);

      // Attempt deposit and redeem when imbalanced
      await expect(
        depositWithApprovalToDLoop(
          dLoopVaultContract,
          underlyingTokenSymbol,
          testAccount1,
          depositAmount,
        ),
      ).to.be.revertedWithCustomError(dLoopVaultContract, "TooImbalanced");
      await expect(
        redeemWithApprovalFromDLoop(dLoopVaultContract, testAccount1, 10),
      ).to.be.revertedWithCustomError(dLoopVaultContract, "TooImbalanced");

      // Decrease leverage
      await decreaseLeverageWithApproval(
        dLoopVaultContract,
        testAccount1,
        dusdSymbol,
        10,
        1.05,
      );

      // Check post-decrease state
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalance(testAccount1, underlyingTokenSymbol, 910.2);
      await assertTokenBalance(testAccount1, dusdSymbol, 990.0);
      await assertTotalAssetAndSupply(dLoopVaultContract, 46.723762, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 6202411n);

      // Increase oracle price
      await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 2.8);

      // Check imbalanced state
      await assertCurrentLeverageBps(dLoopVaultContract, 1427677n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, true);

      // Increase leverage
      await increaseLeverageWithApproval(
        dLoopVaultContract,
        testAccount1,
        underlyingTokenSymbol,
        20,
        1.05,
      );

      // Check post-increase state
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalance(testAccount1, underlyingTokenSymbol, 890.2);
      await assertTokenBalance(testAccount1, dusdSymbol, 1047.12);
      await assertTotalAssetAndSupply(
        dLoopVaultContract,
        202.587057857142857142,
        100,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 1529219n);
    });
  });
});
