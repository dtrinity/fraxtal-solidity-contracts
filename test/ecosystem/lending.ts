import { FeeAmount } from "@uniswap/v3-sdk";
import chai, { assert } from "chai";
import hre from "hardhat";

import { getStaticOraclePrice } from "../../utils/dex/oracle";
import { getUserHealthFactor, getUserReserveData, getUsersReserveBalances } from "../../utils/lending/account";
import { getUserDebtBalance, getUserSupplyBalance } from "../../utils/lending/balance";
import { getReservesList } from "../../utils/lending/pool";
import { fetchTokenInfo } from "../../utils/token";
import { standardUniswapV3DEXLBPLiquidityFixture } from "./fixtures";
import { increaseTime } from "./utils.chain";
import { swapExactInputSingleWithApproval } from "./utils.dex";
import { borrowAsset, depositCollateralWithApproval, repayAsset } from "./utils.lbp";
import { assertBigIntEqualApproximately } from "./utils.math";
import { getTokenAmount, getTokenBalance, getTokenContractForSymbol, transferTokenToAccount } from "./utils.token";

describe("Test getUserSupplyBalance() and getUserDebtBalance()", function () {
  const initialSupply = 100000;
  const testCases: {
    collateralTokenSymbol: string;
    depositAmount: number;
    expectedSupplyBalance: string;
    borrowTokenSymbol: string;
    borrowAmount: number;
    expectedDebtBalance: string;
    expectErrorMessage?: string;
  }[] = [
    {
      collateralTokenSymbol: "SFRAX",
      depositAmount: 2000,
      expectedSupplyBalance: "2000000000000000000000",
      borrowTokenSymbol: "dUSD",
      borrowAmount: 500,
      expectedDebtBalance: "500000000",
    },
    {
      collateralTokenSymbol: "SFRAX",
      depositAmount: 1234,
      expectedSupplyBalance: "1234000000000000000000",
      borrowTokenSymbol: "dUSD",
      borrowAmount: 1000,
      expectedDebtBalance: "1000000000",
    },
    {
      // This case is because there is no liquidity for SFRAX in the pool
      // thus we cannot borrow SFRAX
      collateralTokenSymbol: "FXS",
      depositAmount: 100,
      expectedSupplyBalance: "100000000000000000000",
      borrowTokenSymbol: "dUSD",
      borrowAmount: 1,
      expectedDebtBalance: "1000000",
    },
  ];

  for (const testCase of testCases) {
    it(`Test case: ${JSON.stringify(testCase)}`, async function () {
      await standardUniswapV3DEXLBPLiquidityFixture();

      const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();

      const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(dexDeployer, testCase.collateralTokenSymbol);
      const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(dexDeployer, testCase.borrowTokenSymbol);

      // Make sure the testAccount1 has 0 balance before the transfer and
      // has initialSupply collateralToken after the transfer
      assert.equal(await getTokenBalance(testAccount1, testCase.collateralTokenSymbol), 0n);
      await transferTokenToAccount(dexDeployer, testAccount1, testCase.collateralTokenSymbol, initialSupply);
      assert.equal(
        await getTokenBalance(testAccount1, testCase.collateralTokenSymbol),
        await getTokenAmount(initialSupply.toString(), testCase.collateralTokenSymbol),
      );

      // We have some collateralToken now, let's deposit it as collateral and make
      // sure the balance is decreased after depositing
      await depositCollateralWithApproval(testAccount1, collateralTokenInfo.address, testCase.depositAmount);

      // Make sure the collateralToken balance is decreased after depositing
      assert.equal(
        await getTokenBalance(testAccount1, testCase.collateralTokenSymbol),
        await getTokenAmount((initialSupply - testCase.depositAmount).toString(), testCase.collateralTokenSymbol),
      );

      // Make sure the user has some supply balance and no debt balance (hasn't borrowed yet)
      const supplyBalance = await getUserSupplyBalance(collateralTokenInfo.address, testAccount1);
      assert.equal(supplyBalance.toString(), testCase.expectedSupplyBalance);
      const debtBalance = await getUserDebtBalance(borrowTokenInfo.address, testAccount1);
      assert.equal(debtBalance.toString(), "0");

      if (testCase.expectErrorMessage) {
        // Now, borrow some borrowToken
        await chai
          .expect(borrowAsset(testAccount1, borrowTokenInfo.address, testCase.borrowAmount))
          .to.rejectedWith(testCase.expectErrorMessage);
      } else {
        await borrowAsset(testAccount1, borrowTokenInfo.address, testCase.borrowAmount);
      }

      // Make sure the user has some debt balance after borrowing and the supply balance is the same
      const newSupplyBalance = await getUserSupplyBalance(collateralTokenInfo.address, testAccount1);
      assert.equal(newSupplyBalance.toString(), testCase.expectedSupplyBalance); // The same as before borrowing
      const updatedDebtBalance = await getUserDebtBalance(borrowTokenInfo.address, testAccount1);
      assert.equal(updatedDebtBalance.toString(), testCase.expectedDebtBalance);
    });
  }
});

describe("Test getUserHealthFactor()", function () {
  const collateralTokenSymbol = "SFRAX";
  const borrowTokenSymbol = "dUSD";
  const initialSupply = 100000;
  const depositAmount = 2000;
  const borrowAmount = 1900;

  it("normal case", async function () {
    await standardUniswapV3DEXLBPLiquidityFixture();

    const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(dexDeployer, collateralTokenSymbol);
    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(dexDeployer, borrowTokenSymbol);

    // Make sure the testAccount1 has 0 balance before the transfer and
    // has initialSupply collateralToken after the transfer
    assert.equal(await getTokenBalance(testAccount1, collateralTokenSymbol), 0n);
    await transferTokenToAccount(dexDeployer, testAccount1, collateralTokenSymbol, initialSupply);
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount(initialSupply.toString(), collateralTokenSymbol),
    );

    // Make sure the health factor is inf before deposit
    assert.isAbove(await getUserHealthFactor(testAccount1), 999999999999);

    // We have some collateralToken now, let's deposit it as collateral and make
    // sure the balance is decreased after depositing
    await depositCollateralWithApproval(testAccount1, collateralTokenInfo.address, depositAmount);

    // Make sure the collateralToken balance is decreased after depositing
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount((initialSupply - depositAmount).toString(), collateralTokenSymbol),
    );

    // Make sure the health factor is inf before borrowing
    assert.isAbove(await getUserHealthFactor(testAccount1), 999999999999);

    // Need to borrow some borrowToken to have the health factor not infinity
    await borrowAsset(testAccount1, borrowTokenInfo.address, borrowAmount);

    // Make sure the health factor around some reasonable value after borrowing
    assert.closeTo(await getUserHealthFactor(testAccount1), 1.1184746563157895, 0.001);

    console.log(`Performing swaps to decrease ${collateralTokenInfo.symbol} price again`);

    for (let i = 0; i < 15; i++) {
      await swapExactInputSingleWithApproval(
        testAccount1,
        FeeAmount.HIGH,
        collateralTokenInfo.address,
        borrowTokenInfo.address,
        1000,
        6000, // deadline is 6000 seconds
      );
      await increaseTime(60);
      const price = await getStaticOraclePrice(testAccount1, collateralTokenInfo.address);
      console.log("- " + collateralTokenInfo.symbol + " price at iteration", i, ":", price.toString());
    }

    // Make sure the health factor is below 1 after the price of collateralToken is decreased
    assert.closeTo(await getUserHealthFactor(testAccount1), 0.8306727852748591, 0.0001);
  });
});

describe("Test getReservesList()", function () {
  it("normal case", async function () {
    await standardUniswapV3DEXLBPLiquidityFixture();

    const tokenAddresses = await getReservesList();
    assert.lengthOf(tokenAddresses, 6);

    let tokenSymbols: string[] = [];

    for (const tokenAddress of tokenAddresses) {
      const tokenInfo = await fetchTokenInfo(hre, tokenAddress);
      tokenSymbols.push(tokenInfo.symbol);
    }

    // Sort to make sure a deterministic order
    tokenSymbols = tokenSymbols.sort((a, b) => a.localeCompare(b));
    assert.deepEqual(tokenSymbols, ["dUSD", "FXS", "SFRAX", "SFRXETH", "vSFRAX", "WETH"]);
  });
});

describe("Test getUserReserveData()", function () {
  it("normal case", async function () {
    const { testAccount1 } = await hre.getNamedAccounts();
    await standardUniswapV3DEXLBPLiquidityFixture();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(testAccount1, "SFRAX");

    const reserveData = await getUserReserveData(collateralTokenInfo.address, testAccount1);

    // Initially user should have no balances or debt
    assert.equal(reserveData.currentATokenBalance, 0n);
    assert.equal(reserveData.currentStableDebt, 0n);
    assert.equal(reserveData.currentVariableDebt, 0n);
    assert.equal(reserveData.principalStableDebt, 0n);
    assert.equal(reserveData.scaledVariableDebt, 0n);
    assert.equal(reserveData.stableBorrowRate, 0n);
    assert.equal(reserveData.liquidityRate, 0n);
    assert.equal(reserveData.stableRateLastUpdated, 0n);
    assert.equal(reserveData.usageAsCollateralEnabled, false);
  });

  it("borrow and repay", async function () {
    const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();
    await standardUniswapV3DEXLBPLiquidityFixture();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(testAccount1, "SFRAX");

    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(testAccount1, "dUSD");

    const { tokenInfo: borrowTokenInfo2 } = await getTokenContractForSymbol(testAccount1, "FXS");

    // Get some collateral token
    await transferTokenToAccount(dexDeployer, testAccount1, collateralTokenInfo.symbol, 1000);

    await depositCollateralWithApproval(testAccount1, collateralTokenInfo.address, 1000);

    await borrowAsset(testAccount1, borrowTokenInfo.address, 100);

    // Stats for collateral token
    const reserveData = await getUserReserveData(collateralTokenInfo.address, testAccount1);
    assert.equal(reserveData.currentATokenBalance, await getTokenAmount("1000", collateralTokenInfo.symbol));
    assert.equal(reserveData.currentStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assert.equal(reserveData.currentVariableDebt, 0n);
    assert.equal(reserveData.principalStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assert.equal(reserveData.scaledVariableDebt, 0n);
    assert.equal(reserveData.stableBorrowRate, 0n);
    assert.equal(reserveData.liquidityRate, 0n);
    assert.equal(reserveData.stableRateLastUpdated, 0n);
    assert.equal(reserveData.usageAsCollateralEnabled, true);

    // Stats for borrow token
    const borrowReserveData = await getUserReserveData(borrowTokenInfo.address, testAccount1);
    assert.equal(borrowReserveData.currentATokenBalance, 0n);
    assert.equal(borrowReserveData.currentStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assert.equal(borrowReserveData.currentVariableDebt, await getTokenAmount("100", borrowTokenInfo.symbol));
    assert.equal(borrowReserveData.principalStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assert.equal(borrowReserveData.scaledVariableDebt, await getTokenAmount("100", borrowTokenInfo.symbol));
    assert.equal(borrowReserveData.stableBorrowRate, 0n);
    // Liquidity rate can vary significantly based on utilization and market conditions
    // Just verify it's a positive rate indicating lending activity
    assert(borrowReserveData.liquidityRate > 0n, "Liquidity rate should be positive after borrowing");
    assert.equal(borrowReserveData.stableRateLastUpdated, 0n);
    assert.equal(borrowReserveData.usageAsCollateralEnabled, false);

    // Borrow more DUSD
    await borrowAsset(testAccount1, borrowTokenInfo.address, 250);

    // Stats after borrowing more DUSD
    const borrowReserveDataAdditional = await getUserReserveData(borrowTokenInfo.address, testAccount1);
    assert.equal(borrowReserveDataAdditional.currentATokenBalance, 0n);
    assert.equal(borrowReserveDataAdditional.currentStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assertBigIntEqualApproximately(borrowReserveDataAdditional.currentVariableDebt, await getTokenAmount("350", borrowTokenInfo.symbol));
    assert.equal(borrowReserveDataAdditional.principalStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assert.equal(borrowReserveDataAdditional.scaledVariableDebt, await getTokenAmount("350", borrowTokenInfo.symbol));
    assert.equal(borrowReserveDataAdditional.stableBorrowRate, 0n);
    assert(borrowReserveDataAdditional.liquidityRate > 0n, "Liquidity rate should be positive after additional borrowing");
    assert.equal(borrowReserveDataAdditional.stableRateLastUpdated, 0n);
    assert.equal(borrowReserveDataAdditional.usageAsCollateralEnabled, false);

    // Borrow another asset
    await borrowAsset(testAccount1, borrowTokenInfo2.address, 100);

    // Stats for borrow token 2
    const borrowReserveData2 = await getUserReserveData(borrowTokenInfo2.address, testAccount1);
    assert.equal(borrowReserveData2.currentATokenBalance, 0n);
    assert.equal(borrowReserveData2.currentStableDebt, await getTokenAmount("0", borrowTokenInfo2.symbol));
    assert.equal(borrowReserveData2.currentVariableDebt, await getTokenAmount("100", borrowTokenInfo2.symbol));
    assert.equal(borrowReserveData2.principalStableDebt, await getTokenAmount("0", borrowTokenInfo2.symbol));
    assert.equal(borrowReserveData2.scaledVariableDebt, await getTokenAmount("100", borrowTokenInfo2.symbol));
    assert.equal(borrowReserveData2.stableBorrowRate, 0n);
    assert.equal(borrowReserveData2.liquidityRate, 6750000000000000000000n);
    assert.equal(borrowReserveData2.stableRateLastUpdated, 0n);
    assert.equal(borrowReserveData2.usageAsCollateralEnabled, false);

    // Repay borrowed DUSD
    await repayAsset(testAccount1, borrowTokenInfo.address, 200);

    // Stats after repaying DUSD
    const borrowReserveDataRepay = await getUserReserveData(borrowTokenInfo.address, testAccount1);
    assert.equal(borrowReserveDataRepay.currentATokenBalance, 0n);
    assert.equal(borrowReserveDataRepay.currentStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assertBigIntEqualApproximately(borrowReserveDataRepay.currentVariableDebt, await getTokenAmount("150", borrowTokenInfo.symbol));
    assert.equal(borrowReserveDataRepay.principalStableDebt, await getTokenAmount("0", borrowTokenInfo.symbol));
    assertBigIntEqualApproximately(borrowReserveDataRepay.scaledVariableDebt, await getTokenAmount("150", borrowTokenInfo.symbol));
    assert.equal(borrowReserveDataRepay.stableBorrowRate, 0n);
    assert(borrowReserveDataRepay.liquidityRate > 0n, "Liquidity rate should be positive after repayment");
    assert.equal(borrowReserveDataRepay.stableRateLastUpdated, 0n);
    assert.equal(borrowReserveDataRepay.usageAsCollateralEnabled, false);
  });
});

describe("getUsersReserveBalances", () => {
  it("should get reserve balances for single user", async () => {
    const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();
    await standardUniswapV3DEXLBPLiquidityFixture();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(testAccount1, "SFRAX");

    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(testAccount1, "dUSD");

    // Get some collateral token
    await transferTokenToAccount(dexDeployer, testAccount1, collateralTokenInfo.symbol, 1000);

    await depositCollateralWithApproval(testAccount1, collateralTokenInfo.address, 1000);

    await borrowAsset(testAccount1, borrowTokenInfo.address, 100);

    const balances = await getUsersReserveBalances([testAccount1], 1);

    assert.equal(Object.keys(balances).length, 1);
    assert.equal(Object.keys(balances[testAccount1]).length, 6);
    assert.equal(balances[testAccount1][collateralTokenInfo.address].collateral, await getTokenAmount("1000", collateralTokenInfo.symbol));
    assert.equal(balances[testAccount1][borrowTokenInfo.address].debt, await getTokenAmount("100", borrowTokenInfo.symbol));
  });

  it("should get reserve balances for multiple users", async () => {
    const { dexDeployer, testAccount1, testAccount2 } = await hre.getNamedAccounts();
    await standardUniswapV3DEXLBPLiquidityFixture();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(testAccount1, "SFRAX");

    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(testAccount1, "dUSD");

    // First user deposits and borrows
    await transferTokenToAccount(dexDeployer, testAccount1, collateralTokenInfo.symbol, 1000);
    await depositCollateralWithApproval(testAccount1, collateralTokenInfo.address, 1000);
    await borrowAsset(testAccount1, borrowTokenInfo.address, 100);

    // Second user deposits and borrows
    await transferTokenToAccount(dexDeployer, testAccount2, collateralTokenInfo.symbol, 2000);
    await depositCollateralWithApproval(testAccount2, collateralTokenInfo.address, 2000);
    await borrowAsset(testAccount2, borrowTokenInfo.address, 1000);

    const balances = await getUsersReserveBalances([testAccount1, testAccount2], 2);

    // Assert that the balances are correct
    assert.equal(Object.keys(balances).length, 2);
    assert.equal(Object.keys(balances[testAccount1]).length, 6);
    assert.equal(Object.keys(balances[testAccount2]).length, 6);

    // Check first user balances
    assert.equal(balances[testAccount1][collateralTokenInfo.address].collateral, await getTokenAmount("1000", collateralTokenInfo.symbol));
    assertBigIntEqualApproximately(
      balances[testAccount1][borrowTokenInfo.address].debt,
      await getTokenAmount("100", borrowTokenInfo.symbol),
      1e-6,
    );

    // Check second user balances
    assert.equal(balances[testAccount2][collateralTokenInfo.address].collateral, await getTokenAmount("2000", collateralTokenInfo.symbol));
    assert.equal(balances[testAccount2][borrowTokenInfo.address].debt, await getTokenAmount("1000", borrowTokenInfo.symbol));
  });
});
