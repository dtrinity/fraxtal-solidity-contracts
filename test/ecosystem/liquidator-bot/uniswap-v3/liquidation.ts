import { BigNumber } from "@ethersproject/bignumber";
import { FeeAmount } from "@uniswap/v3-sdk";
import { assert } from "chai";
import { ethers } from "ethers";
import hre, { getNamedAccounts } from "hardhat";

import { MintableERC20 } from "../../../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../../utils/constants";
import {
  getOraclePrice,
  getStaticOraclePrice,
} from "../../../../utils/dex/oracle";
import { getUserHealthFactor } from "../../../../utils/lending/account";
import { getCloseFactorHFThreshold } from "../../../../utils/lending/utils";
import { getMaxLiquidationAmount } from "../../../../utils/liquidator-bot/shared/utils";
import { TokenInfo } from "../../../../utils/token";
import {
  standardUniswapV3DEXLBPLiquidityFixture,
  standardUniswapV3DEXLBPLiquidityWithMockOracleFixture,
} from "../../fixtures";
import { increaseTime } from "../../utils.chain";
import {
  setMockStaticOracleWrapperPrice,
  swapExactInputSingleWithApproval,
} from "../../utils.dex";
import {
  borrowAsset,
  depositCollateralWithApproval,
  liquidateAsset,
} from "../../utils.lbp";
import {
  assertBigIntEqualApproximately,
  assertNumberEqualApproximately,
} from "../../utils.math";
import { getTokenContractForSymbol } from "../../utils.token";

describe("Liquidation scenarios", function () {
  it("can liquidate sFRAX collateral", async function () {
    await standardUniswapV3DEXLBPLiquidityFixture();

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
      "dUSD",
    );

    const { contract: sfraxContract, tokenInfo: sfraxInfo } =
      await getTokenContractForSymbol(testAccount1, "SFRAX");

    const { contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(testAccount1, "dUSD");

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

    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount1),
      ethers.parseUnits("800", dusdInfo.decimals),
    );
    assertBigIntEqualApproximately(
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

    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("21390.055864", dusdInfo.decimals),
    );
    assertBigIntEqualApproximately(
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

    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("20990.055864", dusdInfo.decimals),
    );
    assertBigIntEqualApproximately(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("80495.042619633531735414", sfraxInfo.decimals),
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

    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("35271.851875", dusdInfo.decimals),
    );
    assertBigIntEqualApproximately(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("60495.042619633531735414", sfraxInfo.decimals),
    );

    // Liquidate the sFRAX collateral again
    await liquidateAsset(
      sfraxInfo.address,
      dusdInfo.address,
      testAccount1,
      200,
      testAccount2,
    );

    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount2),
      ethers.parseUnits("35071.851875", dusdInfo.decimals),
    );
    assertBigIntEqualApproximately(
      await sfraxContract.balanceOf(testAccount2),
      ethers.parseUnits("60837.442897101672775501", sfraxInfo.decimals),
      1e-4,
    );
  });
});

describe("Test getMaxLiquidationAmount()", function () {
  let dusdInfo: TokenInfo;
  let sfraxInfo: TokenInfo;
  let dusdContract: MintableERC20;
  let sfraxContract: MintableERC20;
  let sfraxBalanceBefore: bigint;

  beforeEach(async function () {
    await standardUniswapV3DEXLBPLiquidityWithMockOracleFixture();

    const { dexDeployer, testAccount1 } = await getNamedAccounts();

    const { contract: sfraxViaDeployer } = await getTokenContractForSymbol(
      dexDeployer,
      "SFRAX",
    );

    ({ contract: sfraxContract, tokenInfo: sfraxInfo } =
      await getTokenContractForSymbol(testAccount1, "SFRAX"));

    ({ contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(testAccount1, "dUSD"));

    // First we need some sFRAX to borrow against
    await sfraxViaDeployer.transfer(
      testAccount1,
      ethers.parseUnits("1000", sfraxInfo.decimals),
    );

    sfraxBalanceBefore = await sfraxContract.balanceOf(testAccount1);

    // We have some sFRAX now, let's deposit it as collateral
    await depositCollateralWithApproval(testAccount1, sfraxInfo.address, 1000);

    // Set the price of sFRAX
    await setMockStaticOracleWrapperPrice(sfraxInfo.address, 1.24993492);
  });

  it("health factor >= 1, which leads to zero liquidation amount", async function () {
    const { dexDeployer, testAccount1 } = await getNamedAccounts();

    // Let's borrow some DUSD against our sFRAX
    await borrowAsset(testAccount1, dusdInfo.address, 800);

    const sfraxBalanceAfter = await sfraxContract.balanceOf(testAccount1);
    assertBigIntEqualApproximately(
      BigInt(sfraxBalanceBefore) - BigInt(sfraxBalanceAfter),
      ethers.parseUnits("1000", sfraxInfo.decimals),
    );
    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount1),
      ethers.parseUnits("800", dusdInfo.decimals),
    );

    // Check the price of sFRAX
    const sFraxPrice = await getOraclePrice(dexDeployer, sfraxInfo.address);
    assertBigIntEqualApproximately(
      BigNumber.from(sFraxPrice.toString()).toBigInt(),
      ethers.parseUnits("1.24993492", AAVE_ORACLE_USD_DECIMALS),
    );

    const healthFactor = await getUserHealthFactor(testAccount1);
    assertNumberEqualApproximately(healthFactor, 1.3280558525);

    const { toLiquidateAmount } = await getMaxLiquidationAmount(
      sfraxInfo,
      dusdInfo,
      testAccount1,
      dexDeployer,
    );
    assert.equal(toLiquidateAmount.toString(), "0");
  });

  it("health factor < 1 which leads to non-zero liquidation amount", async function () {
    const { dexDeployer, testAccount1 } = await getNamedAccounts();

    // Let's borrow some DUSD against our sFRAX
    await borrowAsset(testAccount1, dusdInfo.address, 800);

    const sfraxBalanceAfter = await sfraxContract.balanceOf(testAccount1);
    assertBigIntEqualApproximately(
      BigInt(sfraxBalanceBefore) - BigInt(sfraxBalanceAfter),
      ethers.parseUnits("1000", sfraxInfo.decimals),
    );
    assertBigIntEqualApproximately(
      await dusdContract.balanceOf(testAccount1),
      ethers.parseUnits("800", dusdInfo.decimals),
    );

    // Check the health factor before changing the price
    assertNumberEqualApproximately(
      await getUserHealthFactor(testAccount1),
      1.3280558525,
    );

    // Change the price to make the health factor < 1
    await setMockStaticOracleWrapperPrice(sfraxInfo.address, 0.85);

    // Check the health factor after changing the price
    assertNumberEqualApproximately(
      await getUserHealthFactor(testAccount1),
      0.903125,
      1e-6,
    );

    const { toLiquidateAmount } = await getMaxLiquidationAmount(
      sfraxInfo,
      dusdInfo,
      testAccount1,
      dexDeployer,
    );
    assert.equal(toLiquidateAmount.toString(), "800000000");
  });
});

describe("Test getCloseFactorHFThreshold()", () => {
  it("normal case", async () => {
    await standardUniswapV3DEXLBPLiquidityFixture();
    const closeFactorHFThreshold = await getCloseFactorHFThreshold(hre);
    assert.equal(closeFactorHFThreshold, 0.95);
  });
});
