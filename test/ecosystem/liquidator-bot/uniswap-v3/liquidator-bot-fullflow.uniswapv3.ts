import { FeeAmount } from "@uniswap/v3-sdk";
import { assert } from "chai";
import hre from "hardhat";

import { getStaticOraclePrice } from "../../../../utils/dex/oracle";
import { runUniswapV3Bot } from "../../../../utils/liquidator-bot/uniswap-v3/run";
import { getFlashMintLiquidatorBot } from "../../../../utils/liquidator-bot/uniswap-v3/utils";
import { standardUniswapV3DEXLBPLiquidityFixture } from "../../fixtures";
import { increaseTime } from "../../utils.chain";
import { swapExactInputSingleWithApproval } from "../../utils.dex";
import { borrowAsset, depositCollateralWithApproval } from "../../utils.lbp";
import {
  getTokenAmount,
  getTokenBalance,
  getTokenContractForSymbol,
  transferTokenToAccount,
} from "../../utils.token";

describe("Test UniswapV3 liquidator bot", function () {
  // TODO:Skip these test for now as we dont have UniswapV3 liquidator bot
  it.skip("normal case", async function () {
    const collateralTokenSymbol = "SFRAX";
    const borrowTokenSymbol = "dUSD";
    const priceDecimals = 8;

    await standardUniswapV3DEXLBPLiquidityFixture();
    const { liquidatorBotDeployer, dexDeployer, testAccount1, testAccount2 } =
      await hre.getNamedAccounts();

    const { contract: flashLoanLiquidatorBotContract } =
      await getFlashMintLiquidatorBot(liquidatorBotDeployer);

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      collateralTokenSymbol,
    );
    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      borrowTokenSymbol,
    );

    /**
     * In this test, testAccount1 will be the borrower who got liquidated
     * and testAccount2 will be the liquidator
     */

    // Make sure the testAccount1 has 0 balance before the transfer and
    // has 100000 collateralToken after the transfer
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      0n,
    );
    assert.equal(await getTokenBalance(testAccount1, borrowTokenSymbol), 0n);
    await transferTokenToAccount(
      dexDeployer,
      testAccount1,
      collateralTokenSymbol,
      100000,
    );
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount("100000", collateralTokenSymbol),
    );

    // We have some collateralToken now, let's deposit it as collateral and make
    // sure the balance is decreased after depositing
    await depositCollateralWithApproval(
      testAccount1,
      collateralTokenInfo.address,
      2000,
    );
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount("98000", collateralTokenSymbol),
    );

    // Let's borrow some borrowToken against our collateralToken and make sure the balance
    // of borrowToken is increased after borrowing
    await borrowAsset(testAccount1, borrowTokenInfo.address, 1600);
    assert.equal(
      await getTokenBalance(testAccount1, borrowTokenSymbol),
      await getTokenAmount("1600", borrowTokenSymbol),
    );

    // Check the price before swapping (in order to compare after swapping)
    assert.equal(
      await getStaticOraclePrice(testAccount1, collateralTokenInfo.address),
      hre.ethers.parseUnits("1.24993492", priceDecimals),
    );

    // Perform swaps to decrease the price of the collateralToken
    console.log(
      "Performing swaps to decrease " + collateralTokenInfo.symbol + " price",
    );

    for (let i = 0; i < 20; i++) {
      const swapDeadlineInSeconds = 6000;
      const swapPoolFeeSchema = FeeAmount.HIGH;
      await swapExactInputSingleWithApproval(
        testAccount1,
        swapPoolFeeSchema,
        collateralTokenInfo.address,
        borrowTokenInfo.address,
        1000,
        swapDeadlineInSeconds,
      );
      await increaseTime(60);
      const price = await getStaticOraclePrice(
        testAccount1,
        collateralTokenInfo.address,
      );
      console.log(
        "- " + collateralTokenInfo.symbol + " price at iteration",
        i,
        ":",
        price.toString(),
      );
    }

    // Make sure the last price is decreased as expected
    assert.equal(
      await getStaticOraclePrice(testAccount1, collateralTokenInfo.address),
      hre.ethers.parseUnits("0.84841180", priceDecimals),
    );

    // Make sure the collateralToken balance decreased and the borrowToken balance increased
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount("78000", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount1, borrowTokenSymbol),
      await getTokenAmount("21990.055864", borrowTokenSymbol),
    );

    // Make sure the testAccount2 has 0 balance before liquidating so that we can trigger flash mint
    // on the borrowToken for the liquidation
    // Also make sure the testAccount2 has 0 balance of collateralToken (to compare after liquidation)
    assert.equal(
      await getTokenBalance(testAccount2, collateralTokenSymbol),
      await getTokenAmount("0", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, borrowTokenSymbol),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    // Make sure the liquidator has 0 balance before liquidating so that we can trigger flash mint
    assert.equal(
      await getTokenBalance(
        await flashLoanLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    // Run the full-flow
    await runUniswapV3Bot(0);
  });
});
