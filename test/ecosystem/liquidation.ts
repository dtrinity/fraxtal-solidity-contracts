import { FeeAmount } from "@uniswap/v3-sdk";
import { assert } from "chai";
import { ethers } from "ethers";
import { getNamedAccounts } from "hardhat";

import { getStaticOraclePrice } from "../../utils/dex/oracle";
import { getMaxLiquidationAmount } from "../../utils/liquidator-bot/utils";
import { standardDEXLBPLiquidityFixture } from "./fixtures";
import { increaseTime } from "./utils.chain";
import { swapExactInputSingleWithApproval } from "./utils.dex";
import {
  borrowAsset,
  depositCollateralWithApproval,
  liquidateAsset,
} from "./utils.lbp";
import { getTokenContractForSymbol } from "./utils.token";

describe("Liquidation scenarios", function () {
  it("can liquidate sFRAX collateral", async function () {
    await standardDEXLBPLiquidityFixture();

    const { dexDeployer, testAccount1, testAccount2 } =
      await getNamedAccounts();

    // Make sure the two accounts are different to avoid self-liquidation
    assert.notEqual(testAccount1, testAccount2);

    const { contract: sfraxViaDeployer } = await getTokenContractForSymbol(
      dexDeployer,
      "SFRAX",
    );

    const { contract: dusdViaDeployer } = await getTokenContractForSymbol(
      dexDeployer,
      "DUSD",
    );

    const { contract: sfraxContract, tokenInfo: sfraxInfo } =
      await getTokenContractForSymbol(testAccount1, "SFRAX");

    const { contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(testAccount1, "DUSD");

    // First we need some sFRAX to borrow against
    const sfrax1000 = ethers.parseUnits("1000", sfraxInfo.decimals);
    await sfraxViaDeployer.transfer(testAccount1, sfrax1000);

    // We need some sFRAX to swap with testAccount2 to decrease the sFRAX price
    const sfrax100000 = ethers.parseUnits("100000", sfraxInfo.decimals);
    await sfraxViaDeployer.transfer(testAccount2, sfrax100000);

    // We need some DUSD to liquidate with testAccount2
    const dusd1000 = ethers.parseUnits("1000", dusdInfo.decimals);
    await dusdViaDeployer.transfer(testAccount2, dusd1000);

    assert.equal(await dusdContract.balanceOf(testAccount2), dusd1000);

    const sfraxBalanceBefore = await sfraxContract.balanceOf(testAccount1);

    // We have some sFRAX now, let's deposit it as collateral
    await depositCollateralWithApproval(testAccount1, sfraxInfo.address, 1000);

    // Let's borrow some DUSD against our sFRAX
    await borrowAsset(testAccount1, dusdInfo.address, 800);

    const sfraxBalanceAfter = await sfraxContract.balanceOf(testAccount1);
    assert.isTrue(
      BigInt(sfraxBalanceBefore) - BigInt(sfraxBalanceAfter) == sfrax1000,
      "sFRAX balance should decrease",
    );
    assert.equal(
      await dusdContract.balanceOf(testAccount1),
      ethers.parseUnits("800", dusdInfo.decimals),
      "DUSD balance should increase",
    );

    assert.equal(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("1000", dusdInfo.decimals),
    );

    console.log("Performing swaps to decrease sFRAX price");

    for (let i = 0; i < 20; i++) {
      await swapExactInputSingleWithApproval(
        testAccount2,
        FeeAmount.HIGH,
        sfraxInfo.address,
        dusdInfo.address,
        1000,
        6000,
      );
      await increaseTime(60);
      const price = await getStaticOraclePrice(testAccount2, sfraxInfo.address);
      console.log("- sFRAX price at iteration", i, ":", price.toString());
    }

    assert.equal(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("21390.055864", dusdInfo.decimals),
    );

    assert.equal(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("80000", sfraxInfo.decimals),
    );

    // Liquidate the sFRAX collateral
    await liquidateAsset(
      sfraxInfo.address,
      dusdInfo.address,
      testAccount1,
      400,
      testAccount2,
    );

    assert.equal(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("20990.055864", dusdInfo.decimals),
    );

    assert.equal(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("80495.092122321656235920", sfraxInfo.decimals),
    );

    console.log("Performing swaps to decrease sFRAX price again");

    for (let i = 0; i < 20; i++) {
      await swapExactInputSingleWithApproval(
        testAccount2,
        FeeAmount.HIGH,
        sfraxInfo.address,
        dusdInfo.address,
        1000,
        6000,
      );
      await increaseTime(60);
      const price = await getStaticOraclePrice(testAccount2, sfraxInfo.address);
      console.log("- sFRAX price at iteration", i, ":", price.toString());
    }

    assert.equal(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("35271.851875", dusdInfo.decimals),
    );

    assert.equal(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("60495.092122321656235920", sfraxInfo.decimals),
    );

    // Liquidate the sFRAX collateral again
    await liquidateAsset(
      sfraxInfo.address,
      dusdInfo.address,
      testAccount1,
      200,
      testAccount2,
    );

    assert.equal(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("35071.851875", dusdInfo.decimals),
    );

    assert.equal(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("60837.526636694236141138", sfraxInfo.decimals),
    );
  });
});

describe("Test getMaxLiquidationAmount()", function () {
  it("normal case", async function () {
    await standardDEXLBPLiquidityFixture();

    const { dexDeployer, testAccount1 } = await getNamedAccounts();

    const { contract: sfraxViaDeployer } = await getTokenContractForSymbol(
      dexDeployer,
      "SFRAX",
    );

    const { contract: sfraxContract, tokenInfo: sfraxInfo } =
      await getTokenContractForSymbol(testAccount1, "SFRAX");

    const { contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(testAccount1, "DUSD");

    // First we need some sFRAX to borrow against
    const sfrax1000 = ethers.parseUnits("1000", sfraxInfo.decimals);
    await sfraxViaDeployer.transfer(testAccount1, sfrax1000);

    const sfraxBalanceBefore = await sfraxContract.balanceOf(testAccount1);

    // We have some sFRAX now, let's deposit it as collateral
    await depositCollateralWithApproval(testAccount1, sfraxInfo.address, 1000);

    // Let's borrow some DUSD against our sFRAX
    await borrowAsset(testAccount1, dusdInfo.address, 800);

    const sfraxBalanceAfter = await sfraxContract.balanceOf(testAccount1);
    assert.equal(
      BigInt(sfraxBalanceBefore) - BigInt(sfraxBalanceAfter),
      sfrax1000,
      "sFRAX balance should decrease",
    );
    assert.equal(
      await dusdContract.balanceOf(testAccount1),
      ethers.parseUnits("800", dusdInfo.decimals),
      "DUSD balance should increase",
    );

    const { toLiquidateAmount } = await getMaxLiquidationAmount(
      sfraxInfo,
      dusdInfo,
      testAccount1,
      dexDeployer,
    );
    assert.equal(toLiquidateAmount.toString(), "400000000");
  });
});
