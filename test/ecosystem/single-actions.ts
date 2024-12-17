import { FeeAmount } from "@uniswap/v3-sdk";
import { assert } from "chai";
import { ethers, getNamedAccounts } from "hardhat";

import { TEST_WETH9_ID } from "../../utils/dex/deploy-ids";
import {
  freshFixture,
  standardUniswapV3DEXLBPLiquidityFixture,
} from "./fixtures";
import { swapExactInputSingleWithApproval } from "./utils.dex";
import {
  borrowAsset,
  depositCollateralWithApproval,
  repayAsset,
} from "./utils.lbp";
import { getTokenContractForSymbol } from "./utils.token";

describe("dTrinity basic functions", () => {
  describe("dSwap positive scenarios", function () {
    it("can perform a basic swap against the initial pool", async function () {
      await freshFixture();

      const { dexDeployer } = await getNamedAccounts();

      const { contract: wfrxethContract } = await getTokenContractForSymbol(
        dexDeployer,
        TEST_WETH9_ID,
      );
      const wfrxethBalanceBefore = await wfrxethContract.balanceOf(dexDeployer);
      const { contract: dusdContract } = await getTokenContractForSymbol(
        dexDeployer,
        "DUSD",
      );
      const dusdBalanceBefore = await dusdContract.balanceOf(dexDeployer);

      await swapExactInputSingleWithApproval(
        dexDeployer,
        FeeAmount.MEDIUM,
        await wfrxethContract.getAddress(),
        await dusdContract.getAddress(),
        0.0001,
        6000,
      );

      const wfrxethBalanceAfter = await wfrxethContract.balanceOf(dexDeployer);
      const dusdBalanceAfter = await dusdContract.balanceOf(dexDeployer);
      assert.isTrue(
        wfrxethBalanceBefore > wfrxethBalanceAfter,
        `wfrxETH balance should decrease, before: ${wfrxethBalanceBefore} after: ${wfrxethBalanceAfter}`,
      );
      assert.isTrue(
        dusdBalanceBefore < dusdBalanceAfter,
        `DUSD balance should increase, before: ${dusdBalanceBefore} after: ${dusdBalanceAfter}`,
      );
    });

    it("can perform a swap against a newly created pool", async function () {
      await standardUniswapV3DEXLBPLiquidityFixture();

      const { dexDeployer } = await getNamedAccounts();

      const { contract: dusdContract, tokenInfo: dusdInfo } =
        await getTokenContractForSymbol(dexDeployer, "DUSD");
      const dusdBalanceBefore = await dusdContract.balanceOf(dexDeployer);
      const { contract: sfraxContract, tokenInfo: sfraxInfo } =
        await getTokenContractForSymbol(dexDeployer, "SFRAX");
      const sfraxBalanceBefore = await sfraxContract.balanceOf(dexDeployer);

      await swapExactInputSingleWithApproval(
        dexDeployer,
        FeeAmount.HIGH,
        dusdInfo.address,
        sfraxInfo.address,
        100,
        6000,
      );

      const dusdBalanceAfter = await dusdContract.balanceOf(dexDeployer);
      const sfraxBalanceAfter = await sfraxContract.balanceOf(dexDeployer);
      assert.isTrue(
        dusdBalanceBefore > dusdBalanceAfter,
        `DUSD balance should increase, before: ${dusdBalanceBefore} after: ${dusdBalanceAfter}`,
      );
      assert.isTrue(
        sfraxBalanceBefore < sfraxBalanceAfter,
        `sFRAX balance should decrease, before: ${sfraxBalanceBefore} after: ${sfraxBalanceAfter}`,
      );
    });
  });

  describe("dLend positive scenarios", function () {
    it("can deposit DUSD as collateral", async function () {
      await freshFixture();

      const { lendingDeployer } = await getNamedAccounts();

      const { contract: dusdContract } = await getTokenContractForSymbol(
        lendingDeployer,
        "DUSD",
      );

      const dusdBalanceBefore = await dusdContract.balanceOf(lendingDeployer);

      await depositCollateralWithApproval(
        lendingDeployer,
        await dusdContract.getAddress(),
        50,
      );

      const dusdBalanceAfter = await dusdContract.balanceOf(lendingDeployer);
      assert.isTrue(
        dusdBalanceBefore > dusdBalanceAfter,
        `DUSD balance should decrease, before: ${dusdBalanceBefore} after: ${dusdBalanceAfter}`,
      );
    });

    it("can borrow and repay DUSD against sFRAX collateral", async function () {
      await standardUniswapV3DEXLBPLiquidityFixture();

      const { dexDeployer, testAccount1 } = await getNamedAccounts();

      // First we need some sFRAX to borrow against
      const { contract: sfraxViaDeployer } = await getTokenContractForSymbol(
        dexDeployer,
        "SFRAX",
      );

      const { contract: sfraxContract, tokenInfo: sfraxInfo } =
        await getTokenContractForSymbol(testAccount1, "SFRAX");

      const { contract: dusdContract, tokenInfo: dusdInfo } =
        await getTokenContractForSymbol(testAccount1, "DUSD");

      const sfrax1000 = ethers.parseUnits("1000", sfraxInfo.decimals);
      await sfraxViaDeployer.transfer(testAccount1, sfrax1000);

      const sfraxBalanceBefore = await sfraxContract.balanceOf(testAccount1);

      // We have some sFRAX now, let's deposit it as collateral
      await depositCollateralWithApproval(
        testAccount1,
        sfraxInfo.address,
        1000,
      );

      // Let's borrow some DUSD against our sFRAX
      await borrowAsset(testAccount1, dusdInfo.address, 800);

      const dusdBalanceAfter = await dusdContract.balanceOf(testAccount1);
      const sfraxBalanceAfter = await sfraxContract.balanceOf(testAccount1);
      assert.isTrue(
        BigInt(sfraxBalanceBefore) - BigInt(sfraxBalanceAfter) == sfrax1000,
        "sFRAX balance should decrease",
      );
      const dusd800 = ethers.parseUnits("800", dusdInfo.decimals);
      assert.equal(dusdBalanceAfter, dusd800, "DUSD balance should increase");

      // Repay the DUSD
      await repayAsset(testAccount1, dusdInfo.address, 700);

      const dusdBalanceAfterRepay = await dusdContract.balanceOf(testAccount1);
      const dusd100 = ethers.parseUnits("100", dusdInfo.decimals);
      assert.equal(dusdBalanceAfterRepay, dusd100);

      // The sFRAX balance should be the same as the repaying action does not affect it
      const sfraxBalanceAfterRepay =
        await sfraxContract.balanceOf(testAccount1);
      assert.equal(BigInt(sfraxBalanceAfterRepay), BigInt(sfraxBalanceAfter));
    });
  });
});
