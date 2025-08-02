import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { DLoopVaultBase } from "../../typechain-types";
import { ONE_BPS_UNIT } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForAddress } from "../../utils/utils";
import { TOKENS, WHALES } from "../curve/registry";
import { standardDLoopCurveWithMockOracleFixture } from "./DLoop.fixtures";
import { setMockStaticOracleWrapperPrice } from "./utils.dex";
import {
  assertCheckIsTooImbalanced,
  assertCurrentLeverageBps,
  assertSharesBalance,
  assertTotalAssetAndSupply,
  decreaseLeverageWithApprovalFromTokenAddress,
  depositWithApprovalToDLoopFromTokenAddress,
  getDLoopVaultCurveContractFromAddress,
  increaseLeverageWithApprovalFromTokenAddress,
  mintWithApprovalToDLoopFromTokenAddress,
  redeemWithApprovalFromDLoop,
  withdrawWithApprovalFromDLoop,
} from "./utils.dloop";
import { assertUserLendingSupplyAndDebtBalance } from "./utils.lbp";
import {
  assertTokenBalanceFromAddress,
  fillUpAccountBalanceFromAddressWithWhale,
} from "./utils.token";

describe("DLoopVaultCurve via DLoopVaultBase", () => {
  // Skip this test suite as it's not needed for the new vaults
  return;

  before(async function () {
    // Skip tests if not on local_ethereum network
    if (hre.network.name !== "local_ethereum") {
      console.log("This test is only run on local_ethereum network");
      this.skip();
    }
  });

  let dLoopVaultContract: DLoopVaultBase;
  let underlyingTokenInfo: TokenInfo;
  let dusdInfo: TokenInfo;
  let testAccount1: Address;

  const underlyingToken = TOKENS.sDAI;
  const targetLeverageBps = 300 * 100 * ONE_BPS_UNIT; // 3x leverage

  beforeEach(async function () {
    await standardDLoopCurveWithMockOracleFixture();

    const config = await getConfig(hre);

    if (!config.dLoopCurve) {
      throw new Error("The dLoopCurve configuration is not available");
    }

    ({ testAccount1 } = await getNamedAccounts());

    dLoopVaultContract = await getDLoopVaultCurveContractFromAddress(
      hre,
      underlyingToken.address,
      targetLeverageBps,
      testAccount1,
    );

    ({ tokenInfo: underlyingTokenInfo } = await getTokenContractForAddress(
      testAccount1,
      underlyingToken.address,
    ));
    ({ tokenInfo: dusdInfo } = await getTokenContractForAddress(
      testAccount1,
      config.dLoopCurve.dUSDAddress,
    ));

    // Fill up account balances
    await fillUpAccountBalanceFromAddressWithWhale(
      await hre.ethers.getImpersonatedSigner(WHALES.sDAI_whale),
      testAccount1,
      underlyingToken.address,
      1000,
    );
    await fillUpAccountBalanceFromAddressWithWhale(
      await hre.ethers.getImpersonatedSigner(WHALES.USDe_whale),
      testAccount1,
      config.dLoopCurve.dUSDAddress,
      1000,
    );

    // Set initial mock oracle price
    await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 1.25);
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
      this.skip(); // TODO: need to fix the test. So far we only have working tests on fraxtal_testnet

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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
        1000,
      );

      // Deposit
      await depositWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingToken.address,
        testAccount1,
        depositAmount,
      );

      // Check post-deposit state
      await assertTotalAssetAndSupply(dLoopVaultContract, 97.5390096, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 3075692n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
        900,
      );
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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
        994.773964054766,
      );
    });
  });

  describe("Mint and redeem", () => {
    it("should allow mint and redeem", async function () {
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
      await mintWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingToken.address,
        testAccount1,
        mintShares,
      );

      // Check post-mint state
      await assertTotalAssetAndSupply(dLoopVaultContract, 97.5390096, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 3075692n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
        900,
      );
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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
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
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
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
      const config = await getConfig(hre);

      if (!config.dLoopCurve) {
        throw new Error("The dLoopCurve configuration is not available");
      }

      const depositAmount = 100;
      const dLoopVaultAddress = await dLoopVaultContract.getAddress();

      // Initial deposit
      await depositWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingToken.address,
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
        depositWithApprovalToDLoopFromTokenAddress(
          dLoopVaultContract,
          underlyingToken.address,
          testAccount1,
          depositAmount,
        ),
      ).to.be.revertedWithCustomError(dLoopVaultContract, "TooImbalanced");
      await expect(
        redeemWithApprovalFromDLoop(dLoopVaultContract, testAccount1, 10),
      ).to.be.revertedWithCustomError(dLoopVaultContract, "TooImbalanced");

      // Decrease leverage
      await decreaseLeverageWithApprovalFromTokenAddress(
        dLoopVaultContract,
        testAccount1,
        config.dLoopCurve.dUSDAddress,
        10,
        1.05,
      );

      // Check post-decrease state
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
        910.2,
      );
      await assertTokenBalanceFromAddress(
        testAccount1,
        config.dLoopCurve.dUSDAddress,
        990.0,
      );
      await assertTotalAssetAndSupply(dLoopVaultContract, 46.723762, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 6202411n);

      // Increase oracle price
      await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 2.8);

      // Check imbalanced state
      await assertCurrentLeverageBps(dLoopVaultContract, 1427677n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, true);

      // Increase leverage
      await increaseLeverageWithApprovalFromTokenAddress(
        dLoopVaultContract,
        testAccount1,
        underlyingToken.address,
        20,
        1.05,
      );

      // Check post-increase state
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingToken.address,
        890.2,
      );
      await assertTokenBalanceFromAddress(
        testAccount1,
        config.dLoopCurve.dUSDAddress,
        1047.12,
      );
      await assertTotalAssetAndSupply(
        dLoopVaultContract,
        202.587057857142857142,
        100,
      );
      await assertCurrentLeverageBps(dLoopVaultContract, 1529219n);
    });
  });
});
