import { assert } from "chai";
import hre, { ethers } from "hardhat";

import { CurveSwapExtraParams } from "../../../../config/types";
import { ONE_BPS_UNIT } from "../../../../utils/constants";
import { MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID } from "../../../../utils/curve/deploy-ids";
import {
  getFlashLoanLiquidatorBot,
  performCurveLiquidationImplementation,
} from "../../../../utils/liquidator-bot/curve/utils";
import { getTokenAmountFromAddress } from "../../../../utils/token";
import { getTokenContractForAddress } from "../../../../utils/utils";
import { standardMockCurveDEXLBPLiquidityWithMockOracleFixture } from "../../fixtures";
import { setMockStaticOracleWrapperPrice } from "../../utils.dex";
import { borrowAsset, depositCollateralWithApproval } from "../../utils.lbp";
import {
  getTokenAmount,
  getTokenBalance,
  getTokenContractForSymbol,
  mintERC4626Token,
} from "../../utils.token";

describe("Curve liquidator bot scenarios", function () {
  it("Liquidate with sFRAX collateral and WFRXETH as borrowed token", async function () {
    // Define the tokens and the swap fees
    const underlyingCollateralTokenSymbol = "SFRAX";
    const borrowTokenSymbol = "FXS"; // Using FXS as borrow token since it's non-dUSD and can be borrowed
    const repayAmount = "800";

    await standardMockCurveDEXLBPLiquidityWithMockOracleFixture();

    const { liquidatorBotDeployer, dexDeployer, testAccount1, testAccount2 } =
      await hre.getNamedAccounts();

    const { contract: flashLoanLiquidatorBotContract } =
      await getFlashLoanLiquidatorBot(liquidatorBotDeployer);

    const { tokenInfo: borrowTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      borrowTokenSymbol,
    );

    const { tokenInfo: underlyingCollateralTokenInfo } =
      await getTokenContractForSymbol(
        dexDeployer,
        underlyingCollateralTokenSymbol,
      );

    // Use the deployed ERC4626 token as the collateral token
    const { address: collateralTokenAddress } = await hre.deployments.get(
      `v${underlyingCollateralTokenSymbol}`,
    );
    const { tokenInfo: collateralTokenInfo } = await getTokenContractForAddress(
      dexDeployer,
      collateralTokenAddress,
    );
    const collateralTokenSymbol = collateralTokenInfo.symbol;

    /**
     * In this test, testAccount1 will be the borrower who got liquidated
     * and testAccount2 will be the liquidator
     */

    // Make sure the testAccount1 has 0 balance before the mint and
    // has 100000 collateralToken after the mint
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      0n,
    );
    assert.equal(await getTokenBalance(testAccount1, borrowTokenSymbol), 0n);
    await mintERC4626Token(
      hre,
      collateralTokenAddress,
      {
        [testAccount1]: 100000,
      },
      dexDeployer,
    );
    assert.equal(
      await getTokenBalance(testAccount1, collateralTokenSymbol),
      await getTokenAmount("100000", collateralTokenSymbol),
    );

    // Set initial mock oracle price
    await setMockStaticOracleWrapperPrice(borrowTokenInfo.address, 1.1);
    await setMockStaticOracleWrapperPrice(collateralTokenInfo.address, 1.25);
    await setMockStaticOracleWrapperPrice(
      underlyingCollateralTokenInfo.address,
      1.25,
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

    // Drop the mock oracle price
    await setMockStaticOracleWrapperPrice(collateralTokenInfo.address, 0.9);
    await setMockStaticOracleWrapperPrice(
      underlyingCollateralTokenInfo.address,
      0.9,
    );

    const mockCurveRouterNgPoolsOnlyV1Deployment = await hre.deployments.get(
      MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID,
    );
    const mockCurveRouterNgPoolsOnlyV1Contract = await hre.ethers.getContractAt(
      "MockCurveRouterNgPoolsOnlyV1",
      mockCurveRouterNgPoolsOnlyV1Deployment.address,
      await hre.ethers.getSigner(dexDeployer),
    );

    // Set the exchange rate for the borrowToken/collateralToken pool
    await mockCurveRouterNgPoolsOnlyV1Contract.setExchangeRate(
      underlyingCollateralTokenInfo.address,
      borrowTokenInfo.address,
      ethers.parseUnits(
        "1.05",
        await mockCurveRouterNgPoolsOnlyV1Contract.priceDecimals(),
      ),
    );
    await mockCurveRouterNgPoolsOnlyV1Contract.setExchangeRate(
      borrowTokenInfo.address,
      underlyingCollateralTokenInfo.address,
      ethers.parseUnits(
        "1.05",
        await mockCurveRouterNgPoolsOnlyV1Contract.priceDecimals(),
      ),
    );

    // Make sure the liquidator has 0 balance before liquidating so that we can trigger flash loan
    assert.equal(
      await getTokenBalance(
        await flashLoanLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    const repayAmountBigInt = await getTokenAmountFromAddress(
      borrowTokenInfo.address,
      repayAmount,
    );

    const { tokenInfo: dUSDTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      "DUSD",
    );

    // Approve the MockCurveRouterNgPoolsOnlyV1 contract to spend the tokens
    const collateralTokenContract = await hre.ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
      underlyingCollateralTokenInfo.address,
      await hre.ethers.getSigner(dexDeployer),
    );
    await collateralTokenContract.approve(
      mockCurveRouterNgPoolsOnlyV1Contract.getAddress(),
      ethers.parseUnits("100000", underlyingCollateralTokenInfo.decimals),
    );

    // Approve the MockCurveRouterNgPoolsOnlyV1 contract to spend the tokens
    const borrowTokenContract = await hre.ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
      borrowTokenInfo.address,
    );
    await borrowTokenContract.approve(
      mockCurveRouterNgPoolsOnlyV1Contract.getAddress(),
      ethers.parseUnits("100000", borrowTokenInfo.decimals),
    );

    // Add some fund to the MockCurveRouterNgPoolsOnlyV1 contract
    await mockCurveRouterNgPoolsOnlyV1Contract.refillFund(
      underlyingCollateralTokenInfo.address,
      ethers.parseUnits("100000", underlyingCollateralTokenInfo.decimals),
    );
    await mockCurveRouterNgPoolsOnlyV1Contract.refillFund(
      borrowTokenInfo.address,
      ethers.parseUnits("100000", borrowTokenInfo.decimals),
    );

    // Make sure there is no pool between the borrowToken and the collateralToken (that's why we need the underlying token unstake)

    // Add this dummy swap to bypass the check in the liquidator bot typescript
    const dummySwapExtraParamsConfigs: {
      inputToken: string;
      outputToken: string;
      swapExtraParams: CurveSwapExtraParams;
      reverseSwapExtraParams: CurveSwapExtraParams;
    }[] = [
      {
        inputToken: borrowTokenInfo.address,
        outputToken: collateralTokenInfo.address,
        swapExtraParams: {
          route: [
            borrowTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            collateralTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
          ],
          swapParams: [
            [1, 0, 1, 10],
            [0, 1, 1, 30],
            [0, 1, 1, 10],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
          swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT,
        },
        reverseSwapExtraParams: {
          route: [
            collateralTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            borrowTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
          ],
          swapParams: [
            [1, 0, 1, 10],
            [0, 1, 1, 30],
            [0, 1, 1, 10],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
          swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT,
        },
      },
      {
        inputToken: borrowTokenInfo.address,
        outputToken: underlyingCollateralTokenInfo.address,
        swapExtraParams: {
          route: [
            borrowTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            underlyingCollateralTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
          ],
          swapParams: [
            [1, 0, 1, 10],
            [0, 1, 1, 30],
            [0, 1, 1, 10],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
          swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT,
        },
        reverseSwapExtraParams: {
          route: [
            underlyingCollateralTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            borrowTokenInfo.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
          ],
          swapParams: [
            [1, 0, 1, 10],
            [0, 1, 1, 30],
            [0, 1, 1, 10],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ],
          swapSlippageBufferBps: 5 * 100 * ONE_BPS_UNIT,
        },
      },
    ];

    for (const dummySwapExtraParamsConfig of dummySwapExtraParamsConfigs) {
      await flashLoanLiquidatorBotContract.setSwapExtraParams(
        dummySwapExtraParamsConfig as any,
      );
    }

    // Make sure testAccount2 has 0 balance before liquidating
    assert.equal(
      await getTokenBalance(testAccount2, collateralTokenSymbol),
      await getTokenAmount("0", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, borrowTokenSymbol),
      await getTokenAmount("0", borrowTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, underlyingCollateralTokenSymbol),
      await getTokenAmount("0", underlyingCollateralTokenSymbol),
    );

    // Perform the liquidation with the liquidator bot contract
    await performCurveLiquidationImplementation(
      testAccount1,
      testAccount2,
      borrowTokenInfo.address,
      collateralTokenInfo.address,
      repayAmountBigInt,
      dUSDTokenInfo.address,
      {
        [collateralTokenInfo.address]: true,
      },
      dummySwapExtraParamsConfigs,
      undefined,
      flashLoanLiquidatorBotContract,
    );

    // Make sure the testAccount2 receives the "remaining" collateralToken
    // as the liquidation reward
    assert.equal(
      await getTokenBalance(testAccount2, collateralTokenSymbol),
      await getTokenAmount("0", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, borrowTokenSymbol),
      await getTokenAmount("0", borrowTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(testAccount2, underlyingCollateralTokenSymbol),
      await getTokenAmount(
        "268.287666666666666664",
        underlyingCollateralTokenSymbol,
      ),
    );

    // Make sure the liquidatorBot contract does not have any balance
    // after the liquidation
    assert.equal(
      await getTokenBalance(
        await flashLoanLiquidatorBotContract.getAddress(),
        collateralTokenSymbol,
      ),
      await getTokenAmount("0", collateralTokenSymbol),
    );
    assert.equal(
      await getTokenBalance(
        await flashLoanLiquidatorBotContract.getAddress(),
        borrowTokenSymbol,
      ),
      await getTokenAmount("0", borrowTokenSymbol),
    );

    // TODO: check if there is any debt left
  });
});
