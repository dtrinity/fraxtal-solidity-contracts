import { FeeAmount } from "@uniswap/v3-sdk";
import chai, { assert } from "chai";
import hre from "hardhat";

import { getStaticOraclePrice } from "../../utils/dex/oracle";
import { getUserHealthFactor } from "../../utils/lending/account";
import {
  getUserDebtBalance,
  getUserSupplyBalance,
} from "../../utils/lending/balance";
import { getReservesList } from "../../utils/lending/pool";
import { fetchTokenInfo } from "../../utils/token";
import { standardUniswapV3DEXLBPLiquidityFixture } from "./fixtures";
import { increaseTime } from "./utils.chain";
import { swapExactInputSingleWithApproval } from "./utils.dex";
import { borrowAsset, depositCollateralWithApproval } from "./utils.lbp";
import {
  getTokenAmount,
  getTokenBalance,
  getTokenContractForSymbol,
  transferTokenToAccount,
} from "./utils.token";

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
      borrowTokenSymbol: "DUSD",
      borrowAmount: 500,
      expectedDebtBalance: "500000000",
    },
    {
      collateralTokenSymbol: "SFRAX",
      depositAmount: 1234,
      expectedSupplyBalance: "1234000000000000000000",
      borrowTokenSymbol: "DUSD",
      borrowAmount: 1000,
      expectedDebtBalance: "1000000000",
    },
    {
      // This case is because there is no liquidity for SFRAX in the pool
      // thus we cannot borrow SFRAX
      collateralTokenSymbol: "FXS",
      depositAmount: 100,
      expectedSupplyBalance: "100000000000000000000",
      borrowTokenSymbol: "DUSD",
      borrowAmount: 1,
      expectedDebtBalance: "1000000",
    },
  ];

  for (const testCase of testCases) {
    it(`Test case: ${JSON.stringify(testCase)}`, async function () {
      await standardUniswapV3DEXLBPLiquidityFixture();

      const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();

      const { tokenInfo: collateralTokenInfo } =
        await getTokenContractForSymbol(
          dexDeployer,
          testCase.collateralTokenSymbol,
        );
      const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(
        dexDeployer,
        testCase.borrowTokenSymbol,
      );

      // Make sure the testAccount1 has 0 balance before the transfer and
      // has initialSupply collateralToken after the transfer
      assert.equal(
        await getTokenBalance(testAccount1, testCase.collateralTokenSymbol),
        0n,
      );
      await transferTokenToAccount(
        dexDeployer,
        testAccount1,
        testCase.collateralTokenSymbol,
        initialSupply,
      );
      assert.equal(
        await getTokenBalance(testAccount1, testCase.collateralTokenSymbol),
        await getTokenAmount(
          initialSupply.toString(),
          testCase.collateralTokenSymbol,
        ),
      );

      // We have some collateralToken now, let's deposit it as collateral and make
      // sure the balance is decreased after depositing
      await depositCollateralWithApproval(
        testAccount1,
        collateralTokenInfo.address,
        testCase.depositAmount,
      );

      // Make sure the collateralToken balance is decreased after depositing
      assert.equal(
        await getTokenBalance(testAccount1, testCase.collateralTokenSymbol),
        await getTokenAmount(
          (initialSupply - testCase.depositAmount).toString(),
          testCase.collateralTokenSymbol,
        ),
      );

      // Make sure the user has some supply balance and no debt balance (hasn't borrowed yet)
      const supplyBalance = await getUserSupplyBalance(
        collateralTokenInfo.address,
        testAccount1,
      );
      assert.equal(supplyBalance.toString(), testCase.expectedSupplyBalance);
      const debtBalance = await getUserDebtBalance(
        borrowTokenInfo.address,
        testAccount1,
      );
      assert.equal(debtBalance.toString(), "0");

      if (testCase.expectErrorMessage) {
        // Now, borrow some borrowToken
        await chai
          .expect(
            borrowAsset(
              testAccount1,
              borrowTokenInfo.address,
              testCase.borrowAmount,
            ),
          )
          .to.rejectedWith(testCase.expectErrorMessage);
      } else {
        await borrowAsset(
          testAccount1,
          borrowTokenInfo.address,
          testCase.borrowAmount,
        );
      }

      // Make sure the user has some debt balance after borrowing and the supply balance is the same
      const newSupplyBalance = await getUserSupplyBalance(
        collateralTokenInfo.address,
        testAccount1,
      );
      assert.equal(newSupplyBalance.toString(), testCase.expectedSupplyBalance); // The same as before borrowing
      const updatedDebtBalance = await getUserDebtBalance(
        borrowTokenInfo.address,
        testAccount1,
      );
      assert.equal(updatedDebtBalance.toString(), testCase.expectedDebtBalance);
    });
  }
});

describe("Test getUserHealthFactor()", function () {
  const collateralTokenSymbol = "SFRAX";
  const borrowTokenSymbol = "DUSD";
  const initialSupply = 100000;
  const depositAmount = 2000;
  const borrowAmount = 1900;

  it("normal case", async function () {
    await standardUniswapV3DEXLBPLiquidityFixture();

    const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      collateralTokenSymbol,
    );
    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      borrowTokenSymbol,
    );

    // Make sure the testAccount1 has 0 balance before the transfer and
    // has initialSupply collateralToken after the transfer
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      0n,
    );
    await transferTokenToAccount(
      dexDeployer,
      testAccount1,
      collateralTokenSymbol,
      initialSupply,
    );
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount(initialSupply.toString(), collateralTokenSymbol),
    );

    // Make sure the health factor is inf before deposit
    assert.isAbove(await getUserHealthFactor(testAccount1), 999999999999);

    // We have some collateralToken now, let's deposit it as collateral and make
    // sure the balance is decreased after depositing
    await depositCollateralWithApproval(
      testAccount1,
      collateralTokenInfo.address,
      depositAmount,
    );

    // Make sure the collateralToken balance is decreased after depositing
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount(
        (initialSupply - depositAmount).toString(),
        collateralTokenSymbol,
      ),
    );

    // Make sure the health factor is inf before borrowing
    assert.isAbove(await getUserHealthFactor(testAccount1), 999999999999);

    // Need to borrow some borrowToken to have the health factor not infinity
    await borrowAsset(testAccount1, borrowTokenInfo.address, borrowAmount);

    // Make sure the health factor around some reasonable value after borrowing
    assert.closeTo(
      await getUserHealthFactor(testAccount1),
      1.1184746563157895,
      0.001,
    );

    console.log(
      `Performing swaps to decrease ${collateralTokenInfo.symbol} price again`,
    );

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

    // Make sure the health factor is below 1 after the price of collateralToken is decreased
    assert.closeTo(
      await getUserHealthFactor(testAccount1),
      0.8306727852748591,
      0.0001,
    );
  });
});

describe("Test getReservesList()", function () {
  it("normal case", async function () {
    await standardUniswapV3DEXLBPLiquidityFixture();

    const tokenAddresses = await getReservesList();
    assert.lengthOf(tokenAddresses, 5);

    let tokenSymbols: string[] = [];

    for (const tokenAddress of tokenAddresses) {
      const tokenInfo = await fetchTokenInfo(hre, tokenAddress);
      tokenSymbols.push(tokenInfo.symbol);
    }

    // Sort to make sure a deterministic order
    tokenSymbols = tokenSymbols.sort((a, b) => a.localeCompare(b));
    assert.deepEqual(tokenSymbols, ["DUSD", "FXS", "SFRAX", "SFRXETH", "WETH"]);
  });
});
