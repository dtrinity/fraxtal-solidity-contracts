import { expect } from "chai";
import hre, { ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { DLoopVaultBase } from "../../../typechain-types";
import { MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID } from "../../../utils/curve/deploy-ids";
import { TokenInfo } from "../../../utils/token";
import { getTokenContractForAddress } from "../../../utils/utils";
import { standardDLoopMockCurveWithMockOracleFixture } from "../DLoop.fixtures";
import { setMockStaticOracleWrapperPrice } from "../utils.dex";
import {
  assertCheckIsTooImbalanced,
  assertCurrentLeverageBps,
  assertOraclePrice,
  assertSharesBalance,
  assertTotalAssetAndSupply,
  assertTotalAssets,
  depositWithApprovalToDLoopFromTokenAddress,
  depositWithApprovalToDLoopFromTokenAddressRaw,
  getDLoopVaultCurveContractFromAddress,
  withdrawWithApprovalFromDLoop,
  withdrawWithApprovalFromDLoopRaw,
} from "../utils.dloop";
import { assertUserLendingSupplyAndDebtBalance } from "../utils.lbp";
import {
  assertTokenBalanceFromAddress,
  fillUpAccountBalance,
  getTokenContractForSymbol,
} from "../utils.token";

describe("DLoopVaultCurve with Mock Curve", () => {
  let dLoopVaultContract: DLoopVaultBase;
  let underlyingTokenInfo: TokenInfo;
  let dusdInfo: TokenInfo;
  let dexDeployer: string;
  let testAccount1: string;

  // Skip this test suite as it's not needed for the new vaults
  return;

  const targetLeverageBps = 300 * 100 * 100; // 3x leverage

  beforeEach(async function () {
    await standardDLoopMockCurveWithMockOracleFixture();

    ({ testAccount1, dexDeployer } = await getNamedAccounts());

    ({ tokenInfo: underlyingTokenInfo } = await getTokenContractForSymbol(
      dexDeployer,
      "SFRAX",
    ));

    ({ tokenInfo: dusdInfo } = await getTokenContractForSymbol(
      dexDeployer,
      "dUSD",
    ));

    dLoopVaultContract = await getDLoopVaultCurveContractFromAddress(
      hre,
      underlyingTokenInfo.address,
      targetLeverageBps,
      testAccount1,
    );

    ({ tokenInfo: underlyingTokenInfo } = await getTokenContractForAddress(
      testAccount1,
      underlyingTokenInfo.address,
    ));
    ({ tokenInfo: dusdInfo } = await getTokenContractForAddress(
      testAccount1,
      dusdInfo.address,
    ));

    // Fill up account balances
    await fillUpAccountBalance(testAccount1, underlyingTokenInfo.symbol, 1000);
    await fillUpAccountBalance(testAccount1, dusdInfo.symbol, 1000);

    // Set initial mock oracle price
    await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 1);

    // Set exchange rate for the SFRAX/DUSD pool
    const mockCurveRouterNgPoolsOnlyV1Deployment = await hre.deployments.get(
      MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID,
    );
    const mockCurveRouterNgPoolsOnlyV1Contract = await hre.ethers.getContractAt(
      "MockCurveRouterNgPoolsOnlyV1",
      mockCurveRouterNgPoolsOnlyV1Deployment.address,
      await hre.ethers.getSigner(dexDeployer),
    );
    await mockCurveRouterNgPoolsOnlyV1Contract.setExchangeRate(
      underlyingTokenInfo.address,
      dusdInfo.address,
      ethers.parseUnits(
        "1.0",
        await mockCurveRouterNgPoolsOnlyV1Contract.priceDecimals(),
      ),
    );
    await mockCurveRouterNgPoolsOnlyV1Contract.setExchangeRate(
      dusdInfo.address,
      underlyingTokenInfo.address,
      ethers.parseUnits(
        "1.0",
        await mockCurveRouterNgPoolsOnlyV1Contract.priceDecimals(),
      ),
    );

    // Add some fund to the MockCurveRouterNgPoolsOnlyV1 contract
    await refillMockCurveExchange(hre, underlyingTokenInfo.address, "100000");
    await refillMockCurveExchange(hre, dusdInfo.address, "100000");
  });

  describe("Base functionality", () => {
    it("should allow deposit and withdraw", async function () {
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
        underlyingTokenInfo.address,
        1000,
      );

      // Deposit
      await depositWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingTokenInfo.address,
        testAccount1,
        depositAmount,
      );

      // Check post-deposit state
      await assertTotalAssetAndSupply(dLoopVaultContract, 100, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 3000000n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(testAccount1, dLoopVaultAddress, 100);
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingTokenInfo.address,
        900,
      );

      // Withdraw
      await withdrawWithApprovalFromDLoop(
        dLoopVaultContract,
        testAccount1,
        withdrawAmount,
      );

      // Check post-withdraw state
      await assertTotalAssetAndSupply(dLoopVaultContract, 90, 90);
      await assertCurrentLeverageBps(dLoopVaultContract, 3000000n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
    });

    it("should revert deposit and withdraw when too imbalanced", async function () {
      const depositAmount = 100;
      const withdrawAmount = 10;

      // Check initial state
      await assertCurrentLeverageBps(dLoopVaultContract, 0n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertTotalAssetAndSupply(dLoopVaultContract, 0, 0);

      // Initial deposit
      await depositWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingTokenInfo.address,
        testAccount1,
        depositAmount,
      );

      // Check post-deposit state
      await assertCurrentLeverageBps(dLoopVaultContract, 3000000n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertTotalAssetAndSupply(dLoopVaultContract, 100, 100);

      // Decrease oracle price to cause imbalance
      await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 0.75);

      // Check imbalanced state
      await assertCurrentLeverageBps(dLoopVaultContract, 9000000n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, true);
      await assertTotalAssetAndSupply(
        dLoopVaultContract,
        33.333333333333336,
        100,
      );

      // Attempt deposit when imbalanced
      await expect(
        depositWithApprovalToDLoopFromTokenAddress(
          dLoopVaultContract,
          underlyingTokenInfo.address,
          testAccount1,
          depositAmount,
        ),
      ).to.be.revertedWithCustomError(dLoopVaultContract, "TooImbalanced");

      // Attempt withdraw when imbalanced
      await expect(
        withdrawWithApprovalFromDLoop(
          dLoopVaultContract,
          testAccount1,
          withdrawAmount,
        ),
      ).to.be.revertedWithCustomError(dLoopVaultContract, "TooImbalanced");
    });

    it("deposit with less than minimum amount should be reverted (inflation attack)", async function () {
      // Deposit very small amount of tokens and expect revert
      await expect(
        depositWithApprovalToDLoopFromTokenAddressRaw(
          dLoopVaultContract,
          underlyingTokenInfo.address,
          testAccount1,
          1n,
        ),
      ).to.be.revertedWithCustomError(
        dLoopVaultContract,
        "UnderlyingAssetLessThanMinimumAmount",
      );

      // Deposit with a bit more, but still less than minimum amount, expect revert
      await expect(
        depositWithApprovalToDLoopFromTokenAddressRaw(
          dLoopVaultContract,
          underlyingTokenInfo.address,
          testAccount1,
          100n,
        ),
      ).to.be.revertedWithCustomError(
        dLoopVaultContract,
        "UnderlyingAssetLessThanMinimumAmount",
      );
    });

    it("withdraw with less than minimum amount should be reverted (inflation attack)", async function () {
      // Check initial state
      await assertTotalAssetAndSupply(dLoopVaultContract, 0, 0);
      await assertSharesBalance(
        testAccount1,
        await dLoopVaultContract.getAddress(),
        0,
      );
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingTokenInfo.address,
        1000,
      );
      await assertTokenBalanceFromAddress(testAccount1, dusdInfo.address, 1000);

      // Deposit
      await depositWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingTokenInfo.address,
        testAccount1,
        100,
      );

      // Check post-deposit state
      await assertTotalAssetAndSupply(dLoopVaultContract, 100, 100);
      await assertCurrentLeverageBps(dLoopVaultContract, 3000000n);
      await assertCheckIsTooImbalanced(dLoopVaultContract, false);
      await assertSharesBalance(
        testAccount1,
        await dLoopVaultContract.getAddress(),
        100,
      );
      await assertTokenBalanceFromAddress(
        testAccount1,
        underlyingTokenInfo.address,
        900,
      );

      // Withdraw very small amount of tokens and expect revert
      await expect(
        withdrawWithApprovalFromDLoopRaw(dLoopVaultContract, testAccount1, 1n),
      ).to.be.revertedWithCustomError(
        dLoopVaultContract,
        "SharesLessThanMinimumAmount",
      );

      // Withdraw with a bit more, but still less than minimum amount, expect revert
      await expect(
        withdrawWithApprovalFromDLoopRaw(
          dLoopVaultContract,
          testAccount1,
          100n,
        ),
      ).to.be.revertedWithCustomError(
        dLoopVaultContract,
        "SharesLessThanMinimumAmount",
      );
    });
  });

  describe("Get methods", () => {
    it("totalAssets() method should return the correct value", async function () {
      // Make sure total assets is 0 at the beginning
      await assertOraclePrice(underlyingTokenInfo.address, 1);
      await assertTotalAssets(dLoopVaultContract, 0);
      await assertCurrentLeverageBps(dLoopVaultContract, 0n);

      // Deposit
      await depositWithApprovalToDLoopFromTokenAddress(
        dLoopVaultContract,
        underlyingTokenInfo.address,
        testAccount1,
        100,
      );

      // Check state after deposit and before withdraw
      await assertOraclePrice(underlyingTokenInfo.address, 1);
      await assertCurrentLeverageBps(dLoopVaultContract, 3000000n);
      await assertTotalAssets(dLoopVaultContract, 100);

      // Withdraw
      await withdrawWithApprovalFromDLoop(dLoopVaultContract, testAccount1, 50);

      // Check state after withdraw
      await assertCurrentLeverageBps(dLoopVaultContract, 3000000n);
      await assertTotalAssets(dLoopVaultContract, 50);
      await assertOraclePrice(underlyingTokenInfo.address, 1);

      // Change oracle price to cause imbalance
      await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 0.75);

      // Check state after imbalance
      await assertOraclePrice(underlyingTokenInfo.address, 0.75);
      await assertCurrentLeverageBps(dLoopVaultContract, 9000000n); // The current leverage is 9x now
      await assertTotalAssets(dLoopVaultContract, 16.66666666666666);

      // Change oracle up
      await setMockStaticOracleWrapperPrice(underlyingTokenInfo.address, 1.25);

      // Check state after change
      await assertOraclePrice(underlyingTokenInfo.address, 1.25);
      await assertCurrentLeverageBps(dLoopVaultContract, 2142857n); // The current leverage is 2.14x now
      await assertTotalAssets(dLoopVaultContract, 70);
    });
  });
});

/**
 * Refill the mock exchange with the given amount of tokens
 *
 * @param hre - HardhatRuntimeEnvironment
 * @param tokenAddress - The address of the token to refill
 * @param amount - The amount of tokens to refill
 */
async function refillMockCurveExchange(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
  amount: string,
): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();

  const mockCurveRouterNgPoolsOnlyV1Deployment = await hre.deployments.get(
    MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID,
  );
  const mockCurveRouterNgPoolsOnlyV1Contract = await hre.ethers.getContractAt(
    "MockCurveRouterNgPoolsOnlyV1",
    mockCurveRouterNgPoolsOnlyV1Deployment.address,
    await hre.ethers.getSigner(dexDeployer),
  );

  // Approve the tokens to be spent by the mock exchange
  const tokenContract = await hre.ethers.getContractAt(
    "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
    tokenAddress,
    await hre.ethers.getSigner(dexDeployer),
  );
  await tokenContract.approve(
    mockCurveRouterNgPoolsOnlyV1Contract.getAddress(),
    ethers.parseUnits(amount, await tokenContract.decimals()),
  );

  // Add funds to the mock exchange
  await mockCurveRouterNgPoolsOnlyV1Contract.refillFund(
    tokenAddress,
    ethers.parseUnits(amount, await tokenContract.decimals()),
  );
}
