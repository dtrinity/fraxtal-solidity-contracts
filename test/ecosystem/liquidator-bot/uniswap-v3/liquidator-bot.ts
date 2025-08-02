import { BigNumber } from "@ethersproject/bignumber";
import { FeeAmount } from "@uniswap/v3-sdk";
import { assert } from "chai";
import hre from "hardhat";

import { AAVE_ORACLE_USD_DECIMALS } from "../../../../utils/constants";
import { getStaticOraclePrice } from "../../../../utils/dex/oracle";
import { getLiquidationProfitInUSD } from "../../../../utils/liquidator-bot/shared/utils";
import {
  getFlashLoanLiquidatorBot,
  getFlashMintLiquidatorBot,
  performUniswapV3Liquidation,
} from "../../../../utils/liquidator-bot/uniswap-v3/utils";
import { getTokenAmountFromAddress } from "../../../../utils/token";
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

describe("Uniswap V3 liquidator bot scenarios", function () {
  // TODO: Skip these test for now as we dont have UniswapV3 liquidator bot
  it.skip("Liquidate with sFRAX collateral and DUSD as borrowed token", async function () {
    // Define the tokens and the swap fees
    const collateralTokenSymbol = "SFRAX";
    const borrowTokenSymbol = "dUSD";
    const repayAmount = "800";

    const priceDecimals = AAVE_ORACLE_USD_DECIMALS;

    await standardUniswapV3DEXLBPLiquidityFixture();

    const { liquidatorBotDeployer, dexDeployer, testAccount1, testAccount2 } =
      await hre.getNamedAccounts();

    const { contract: flashMintLiquidatorBotContract } =
      await getFlashMintLiquidatorBot(liquidatorBotDeployer);

    const { contract: flashLoanLiquidatorBotContract } =
      await getFlashLoanLiquidatorBot(liquidatorBotDeployer);

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
      const oracleQuoteTokenAddress = borrowTokenInfo.address;
      await swapExactInputSingleWithApproval(
        testAccount1,
        swapPoolFeeSchema,
        collateralTokenInfo.address,
        oracleQuoteTokenAddress,
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

    // Check the liquidation profit
    const borrowTokenPriceUSDRaw = await getStaticOraclePrice(
      testAccount1,
      borrowTokenInfo.address,
    );
    const borrowTokenPriceUSD =
      Number(borrowTokenPriceUSDRaw) / 10 ** priceDecimals;

    const liquidationProfitInUSD = await getLiquidationProfitInUSD(
      borrowTokenInfo,
      {
        rawValue: BigNumber.from(borrowTokenPriceUSDRaw.toString()),
        decimals: priceDecimals,
      },
      await getTokenAmount(repayAmount, borrowTokenSymbol),
    );

    assert.equal(borrowTokenPriceUSD, 1);
    assert.equal(liquidationProfitInUSD, 40);

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
        await flashMintLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    const repayAmountBigInt = await getTokenAmountFromAddress(
      borrowTokenInfo.address,
      repayAmount,
    );

    // Perform the liquidation with the liquidator bot contract
    await performUniswapV3Liquidation(
      testAccount1,
      testAccount2,
      borrowTokenInfo.address,
      collateralTokenInfo.address,
      repayAmountBigInt,
      flashMintLiquidatorBotContract,
      flashLoanLiquidatorBotContract,
    );

    // Make sure the testAccount2 receives the "remaining" collateralToken
    // as the liquidation reward
    assert.equal(
      await getTokenBalance(testAccount2, collateralTokenSymbol),
      await getTokenAmount("29.524112359948175674", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, borrowTokenSymbol),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    // Make sure the liquidatorBot contract does not have any balance
    // after the liquidation
    assert.equal(
      await getTokenBalance(
        await flashMintLiquidatorBotContract.getAddress(),
        collateralTokenSymbol,
      ),
      await getTokenAmount("0", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(
        await flashMintLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    // TODO: check if there is any debt left
  });

  // TODO: Skip these test for now as we dont have UniswapV3 liquidator bot
  it.skip("Liquidate with sFRAX collateral and FXS as borrowed token", async function () {
    // Define the tokens and the swap fees
    const collateralTokenSymbol = "SFRAX";
    const borrowTokenSymbol = "FXS";
    const oracleQuoteTokenSymbol = "dUSD";
    const repayAmount = "200";

    const priceDecimals = AAVE_ORACLE_USD_DECIMALS;

    await standardUniswapV3DEXLBPLiquidityFixture();

    const { liquidatorBotDeployer, dexDeployer, testAccount1, testAccount2 } =
      await hre.getNamedAccounts();

    const { contract: flashMintLiquidatorBotContract } =
      await getFlashMintLiquidatorBot(liquidatorBotDeployer);

    const { contract: flashLoanLiquidatorBotContract } =
      await getFlashLoanLiquidatorBot(liquidatorBotDeployer);

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      collateralTokenSymbol,
    );
    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      borrowTokenSymbol,
    );
    const { tokenInfo: oracleQuoteTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      oracleQuoteTokenSymbol,
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
    await borrowAsset(testAccount1, borrowTokenInfo.address, 400);
    assert.equal(
      await getTokenBalance(testAccount1, borrowTokenSymbol),
      await getTokenAmount("400", borrowTokenSymbol),
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
      const oracleQuoteTokenAddress = oracleQuoteTokenInfo.address;
      await swapExactInputSingleWithApproval(
        testAccount1,
        swapPoolFeeSchema,
        collateralTokenInfo.address,
        oracleQuoteTokenAddress,
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
      await getTokenAmount("400", borrowTokenSymbol),
    );

    // Check the liquidation profit
    const borrowTokenPriceUSDRaw = await getStaticOraclePrice(
      testAccount1,
      borrowTokenInfo.address,
    );
    const borrowTokenPriceUSD =
      Number(borrowTokenPriceUSDRaw) / 10 ** priceDecimals;

    const liquidationProfitInUSD = await getLiquidationProfitInUSD(
      borrowTokenInfo,
      {
        rawValue: BigNumber.from(borrowTokenPriceUSDRaw.toString()),
        decimals: priceDecimals,
      },
      await getTokenAmount(repayAmount, borrowTokenSymbol),
    );

    assert.equal(borrowTokenPriceUSD, 4.00015587);
    assert.equal(liquidationProfitInUSD, 80.0031174);

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
        await flashMintLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    const repayAmountBigInt = await getTokenAmountFromAddress(
      borrowTokenInfo.address,
      repayAmount,
    );

    // Perform the liquidation with the liquidator bot contract
    await performUniswapV3Liquidation(
      testAccount1,
      testAccount2,
      borrowTokenInfo.address,
      collateralTokenInfo.address,
      repayAmountBigInt,
      flashMintLiquidatorBotContract,
      flashLoanLiquidatorBotContract,
    );

    // Make sure the testAccount2 receives the "remaining" collateralToken
    // as the liquidation reward
    assert.equal(
      await getTokenBalance(testAccount2, collateralTokenSymbol),
      await getTokenAmount("2.011502349399058290", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, borrowTokenSymbol),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    // Make sure the liquidatorBot contract does not have any balance
    // after the liquidation
    assert.equal(
      await getTokenBalance(
        await flashMintLiquidatorBotContract.getAddress(),
        collateralTokenSymbol,
      ),
      await getTokenAmount("0", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(
        await flashMintLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );
  });
});

describe("Test getLiquidationProfitInUSD()", function () {
  const testCases: {
    borrowTokenSymbol: string;
    borrowTokenPriceUSD: number;
    borrowAmount: string;
    expectedProfitUSD: number;
  }[] = [
    {
      borrowTokenSymbol: "dUSD",
      borrowTokenPriceUSD: 0.5,
      borrowAmount: "1000",
      expectedProfitUSD: 25,
    },
    {
      borrowTokenSymbol: "dUSD",
      borrowTokenPriceUSD: 0.659,
      borrowAmount: "1000",
      expectedProfitUSD: 32.95,
    },
    {
      borrowTokenSymbol: "dUSD",
      borrowTokenPriceUSD: 0.233,
      borrowAmount: "1000",
      expectedProfitUSD: 11.65,
    },
    {
      borrowTokenSymbol: "dUSD",
      borrowTokenPriceUSD: 0.142,
      borrowAmount: "1000",
      expectedProfitUSD: 7.1,
    },
    {
      borrowTokenSymbol: "dUSD",
      borrowTokenPriceUSD: 0.142,
      borrowAmount: "5435",
      expectedProfitUSD: 38.5885,
    },
    {
      borrowTokenSymbol: "dUSD",
      borrowTokenPriceUSD: 3.05,
      borrowAmount: "800",
      expectedProfitUSD: 122,
    },
  ];

  const priceDecimals = 8;

  for (const testCase of testCases) {
    it(`Test case: ${JSON.stringify(testCase)}`, async function () {
      await standardUniswapV3DEXLBPLiquidityFixture();

      const { dexDeployer } = await hre.getNamedAccounts();
      const { tokenInfo } = await getTokenContractForSymbol(
        dexDeployer,
        testCase.borrowTokenSymbol,
      );

      const rawPrice = testCase.borrowTokenPriceUSD * 10 ** priceDecimals;

      const profit = await getLiquidationProfitInUSD(
        tokenInfo,
        {
          rawValue: BigNumber.from(rawPrice.toFixed(0)),
          decimals: priceDecimals,
        },
        await getTokenAmount(testCase.borrowAmount, tokenInfo.symbol),
      );

      assert.equal(profit, testCase.expectedProfitUSD);
    });
  }
});
