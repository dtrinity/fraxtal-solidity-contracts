import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  AmoManager,
  CollateralHolderVault,
  Issuer,
  MintableERC20,
  MockAmoVault,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneAmoFixture } from "./fixtures";

describe("AmoCollateralInteraction", () => {
  let amoManagerContract: AmoManager;
  let mockAmoVaultContract: MockAmoVault;
  let collateralHolderVaultContract: CollateralHolderVault;
  let issuerContract: Issuer;
  let dusdContract: MintableERC20;
  let fraxContract: MintableERC20;
  let dusdInfo: TokenInfo;
  let fraxInfo: TokenInfo;
  let dusdDeployer: Address;
  let testAccount1: Address;

  beforeEach(async function () {
    await standaloneAmoFixture();

    ({ dusdDeployer, testAccount1 } = await getNamedAccounts());

    const amoManagerAddress = (await hre.deployments.get("AmoManager")).address;
    amoManagerContract = await hre.ethers.getContractAt(
      "AmoManager",
      amoManagerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const mockAmoVaultAddress = (await hre.deployments.get("MockAmoVault"))
      .address;
    mockAmoVaultContract = await hre.ethers.getContractAt(
      "MockAmoVault",
      mockAmoVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const collateralHolderVaultAddress = (
      await hre.deployments.get("CollateralHolderVault")
    ).address;
    collateralHolderVaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralHolderVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const issuerAddress = (await hre.deployments.get("Issuer")).address;
    issuerContract = await hre.ethers.getContractAt(
      "Issuer",
      issuerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    ({ contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(dusdDeployer, "dUSD"));
    ({ contract: fraxContract, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX"));

    // Whitelist FRAX for all tests
    await mockAmoVaultContract.allowCollateral(fraxInfo.address);
    await collateralHolderVaultContract.allowCollateral(fraxInfo.address);

    // Enable the MockAmoVault
    await amoManagerContract.enableAmoVault(
      await mockAmoVaultContract.getAddress(),
    );

    // Each collateral vault should assign the AMO manager the COLLATERAL_WITHDRAWER_ROLE
    await mockAmoVaultContract.grantRole(
      await mockAmoVaultContract.COLLATERAL_WITHDRAWER_ROLE(),
      await amoManagerContract.getAddress(),
    );
    await collateralHolderVaultContract.grantRole(
      await collateralHolderVaultContract.COLLATERAL_WITHDRAWER_ROLE(),
      await amoManagerContract.getAddress(),
    );
  });

  describe("Validate MockAmoVault functionality", () => {
    it("should correctly report totalCollateralValue including fake DeFi returns", async function () {
      const depositAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const fakeDeFiValue = hre.ethers.parseUnits(
        "500",
        AAVE_ORACLE_USD_DECIMALS,
      );
      const removeAmount = hre.ethers.parseUnits("100", fraxInfo.decimals);

      // Deposit FRAX into the vault
      await fraxContract.approve(
        mockAmoVaultContract.getAddress(),
        depositAmount,
      );
      await mockAmoVaultContract.deposit(
        depositAmount,
        fraxContract.getAddress(),
      );

      // Expected value of deposit
      const depositValue = await mockAmoVaultContract.assetValueFromAmount(
        depositAmount,
        fraxInfo.address,
      );

      // Set fake DeFi collateral value
      await mockAmoVaultContract.setFakeDeFiCollateralValue(fakeDeFiValue);

      const totalCollateralValue =
        await mockAmoVaultContract.totalCollateralValue();
      const expectedTotalValue = depositValue + fakeDeFiValue;

      assert.equal(
        totalCollateralValue.toString(),
        expectedTotalValue.toString(),
        "Total collateral value should include both allocated amount and fake DeFi value",
      );

      // Now simulate losing some collateral value
      const removeValue = await mockAmoVaultContract.assetValueFromAmount(
        removeAmount,
        fraxInfo.address,
      );
      await mockAmoVaultContract.mockRemoveAsset(
        fraxInfo.address,
        removeAmount,
      );
      const totalCollateralValueAfterLoss =
        await mockAmoVaultContract.totalCollateralValue();
      assert.equal(
        totalCollateralValueAfterLoss,
        expectedTotalValue - removeValue,
        "Total collateral value should be equal to the deposit value minus the removed amount",
      );
    });
  });

  describe("Interactions between CollateralHolderVault and AmoVaults", () => {
    it("should not count AMO supply increases, decreases, and allocations as part of the collateral", async () => {
      const depositAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const amoSupplyAmount = hre.ethers.parseUnits("5000", dusdInfo.decimals);
      const amoAllocationAmount = hre.ethers.parseUnits(
        "2000",
        dusdInfo.decimals,
      );

      const depositValue = tokenValueFromAmount(depositAmount, fraxInfo);

      // Deposit some FRAX into the CollateralHolderVault
      await fraxContract.approve(
        collateralHolderVaultContract.getAddress(),
        depositAmount,
      );
      await collateralHolderVaultContract.deposit(
        depositAmount,
        fraxContract.getAddress(),
      );

      // Give dUSD AMO supply to AMO Manager
      await issuerContract.increaseAmoSupply(amoSupplyAmount);

      // Allocate dUSD AMO to an AMO vault
      await amoManagerContract.allocateAmo(
        mockAmoVaultContract.getAddress(),
        amoAllocationAmount,
      );

      const collateralValue1 = await collateralHolderVaultContract.totalValue();
      const amoSupply1 = await amoManagerContract.totalAmoSupply();
      const amoAllocation1 = await amoManagerContract.totalAllocated();

      assert.equal(
        collateralValue1,
        depositValue,
        "Collateral value should only reflect deposits and not AMO allocations",
      );
      assert.equal(
        amoSupply1,
        amoSupplyAmount,
        "AMO supply should be equal to the increased amount and not include any collateral value",
      );
      assert.equal(
        amoAllocation1,
        amoAllocationAmount,
        "AMO allocation should be equal to the allocated amount and not include any collateral value",
      );

      // Now let's decrease the AMO supply
      const amoDeallocationAmount = hre.ethers.parseUnits(
        "500",
        dusdInfo.decimals,
      );
      const amoDecreaseAmount = hre.ethers.parseUnits(
        "1500",
        dusdInfo.decimals,
      );

      // First we pull some funds from the AMO vault back to the AMO manager
      await amoManagerContract.deallocateAmo(
        mockAmoVaultContract.getAddress(),
        amoDeallocationAmount,
      );

      // Then we decrease the AMO supply
      await amoManagerContract.decreaseAmoSupply(amoDecreaseAmount);

      const collateralValue2 = await collateralHolderVaultContract.totalValue();
      const amoSupply2 = await amoManagerContract.totalAmoSupply();
      const amoAllocation2 = await amoManagerContract.totalAllocated();

      assert.equal(
        collateralValue2,
        depositValue,
        "Collateral value should not be affected by AMO supply decreases",
      );
      assert.equal(
        amoSupply2,
        amoSupplyAmount - amoDecreaseAmount,
        "AMO supply should be equal to the decreased amount and not include any collateral value",
      );
      assert.equal(
        amoAllocation2,
        amoAllocationAmount - amoDeallocationAmount,
        "AMO allocation should be equal to the deallocated amount and not include any collateral value",
      );
    });

    it("should decrease AMO allocation when transferring collateral to the holder vault", async () => {
      const depositAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const amoAllocationAmount = hre.ethers.parseUnits(
        "2000",
        dusdInfo.decimals,
      );
      const transferAmount = hre.ethers.parseUnits("500", fraxInfo.decimals);

      // Deposit FRAX into the MockAmoVault
      await fraxContract.approve(
        mockAmoVaultContract.getAddress(),
        depositAmount,
      );
      await mockAmoVaultContract.deposit(
        depositAmount,
        fraxContract.getAddress(),
      );

      // Allocate dUSD AMO to the MockAmoVault
      await issuerContract.increaseAmoSupply(amoAllocationAmount);
      await amoManagerContract.allocateAmo(
        mockAmoVaultContract.getAddress(),
        amoAllocationAmount,
      );

      const initialAllocation = await amoManagerContract.amoVaultAllocation(
        mockAmoVaultContract.getAddress(),
      );
      const initialTotalAllocated = await amoManagerContract.totalAllocated();

      // Transfer collateral from MockAmoVault to CollateralHolderVault
      await amoManagerContract.transferFromAmoVaultToHoldingVault(
        mockAmoVaultContract.getAddress(),
        fraxContract.getAddress(),
        transferAmount,
      );

      const finalAllocation = await amoManagerContract.amoVaultAllocation(
        mockAmoVaultContract.getAddress(),
      );
      const finalTotalAllocated = await amoManagerContract.totalAllocated();

      const transferValue =
        await collateralHolderVaultContract.assetValueFromAmount(
          transferAmount,
          fraxContract.getAddress(),
        );
      const transferValueInDusd =
        await amoManagerContract.usdValueToDusdAmount(transferValue);

      assert.equal(
        finalAllocation,
        initialAllocation - transferValueInDusd,
        "AMO allocation should decrease by the transferred collateral value",
      );
      assert.equal(
        finalTotalAllocated,
        initialTotalAllocated - transferValueInDusd,
        "Total allocated AMO should decrease by the transferred collateral value",
      );
    });

    it("should increase AMO allocation when transferring collateral from the holder vault", async () => {
      const depositAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const transferAmount = hre.ethers.parseUnits("500", fraxInfo.decimals);

      // Deposit FRAX into the CollateralHolderVault
      await fraxContract.approve(
        collateralHolderVaultContract.getAddress(),
        depositAmount,
      );
      await collateralHolderVaultContract.deposit(
        depositAmount,
        fraxContract.getAddress(),
      );

      const initialAllocation = await amoManagerContract.amoVaultAllocation(
        mockAmoVaultContract.getAddress(),
      );
      const initialTotalAllocated = await amoManagerContract.totalAllocated();

      // Transfer collateral from CollateralHolderVault to MockAmoVault
      await amoManagerContract.transferFromHoldingVaultToAmoVault(
        mockAmoVaultContract.getAddress(),
        fraxContract.getAddress(),
        transferAmount,
      );

      const finalAllocation = await amoManagerContract.amoVaultAllocation(
        mockAmoVaultContract.getAddress(),
      );
      const finalTotalAllocated = await amoManagerContract.totalAllocated();

      const transferValue =
        await collateralHolderVaultContract.assetValueFromAmount(
          transferAmount,
          fraxContract.getAddress(),
        );
      const transferValueInDusd =
        await amoManagerContract.usdValueToDusdAmount(transferValue);

      assert.equal(
        finalAllocation,
        initialAllocation + transferValueInDusd,
        "AMO allocation should increase by the transferred collateral value",
      );
      assert.equal(
        finalTotalAllocated,
        initialTotalAllocated + transferValueInDusd,
        "Total allocated AMO should increase by the transferred collateral value",
      );
    });
  });

  describe("Taking profits", () => {
    it("should not be able to take profit when net value of the vault is negative", async () => {
      const collateralAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const amoAllocationAmount = hre.ethers.parseUnits(
        "2000",
        dusdInfo.decimals,
      );
      const amoRemovalAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const lossAmount = hre.ethers.parseUnits("500", fraxInfo.decimals);
      const takeProfitAmount = hre.ethers.parseUnits("100", fraxInfo.decimals);

      // Allocate dUSD AMO to the MockAmoVault
      await issuerContract.increaseAmoSupply(amoAllocationAmount);
      await amoManagerContract.allocateAmo(
        mockAmoVaultContract.getAddress(),
        amoAllocationAmount,
      );

      // Pretend some of the AMO allocation is converted to FRAX
      await mockAmoVaultContract.mockRemoveAsset(
        dusdContract.getAddress(),
        amoRemovalAmount,
      );

      // Deposit FRAX into the MockAmoVault to simulate the converted FRAX
      await fraxContract.approve(
        mockAmoVaultContract.getAddress(),
        collateralAmount,
      );
      await mockAmoVaultContract.deposit(
        collateralAmount,
        fraxContract.getAddress(),
      );

      // Simulate a loss in the vault
      await mockAmoVaultContract.mockRemoveAsset(
        fraxContract.getAddress(),
        lossAmount,
      );

      // Convert depositAmount to collateral value (1000 USD)
      const negativeProfit =
        -1n *
        (await mockAmoVaultContract.assetValueFromAmount(
          lossAmount,
          fraxContract.getAddress(),
        ));
      const withdrawValue = await mockAmoVaultContract.assetValueFromAmount(
        takeProfitAmount,
        fraxContract.getAddress(),
      );

      // Try to withdraw profits
      await expect(
        amoManagerContract.withdrawProfits(
          mockAmoVaultContract.getAddress(),
          testAccount1,
          fraxContract.getAddress(),
          takeProfitAmount,
        ),
      )
        .to.be.revertedWithCustomError(
          amoManagerContract,
          "InsufficientProfits",
        )
        .withArgs(withdrawValue, negativeProfit);
    });

    it("should be able to take profit when net value of the vault is positive", async () => {
      const collateralAmount = hre.ethers.parseUnits("100", fraxInfo.decimals);
      const amoAllocationAmount = hre.ethers.parseUnits(
        "500",
        dusdInfo.decimals,
      );
      const takeProfitAmount = hre.ethers.parseUnits("100", fraxInfo.decimals);

      // Deposit FRAX into the MockAmoVault
      await fraxContract.approve(
        mockAmoVaultContract.getAddress(),
        collateralAmount,
      );
      await mockAmoVaultContract.deposit(
        collateralAmount,
        fraxContract.getAddress(),
      );

      // Allocate dUSD AMO to the MockAmoVault
      await issuerContract.increaseAmoSupply(amoAllocationAmount);
      await amoManagerContract.allocateAmo(
        mockAmoVaultContract.getAddress(),
        amoAllocationAmount,
      );

      const initialFraxBalance = await fraxContract.balanceOf(testAccount1);
      const initialDusdBalance = await dusdContract.balanceOf(testAccount1);

      // Withdraw profits
      await amoManagerContract.withdrawProfits(
        mockAmoVaultContract.getAddress(),
        testAccount1,
        fraxContract.getAddress(),
        takeProfitAmount,
      );

      const finalFraxBalance = await fraxContract.balanceOf(testAccount1);

      assert.equal(
        finalFraxBalance - initialFraxBalance,
        takeProfitAmount,
        "Profit should be withdrawn successfully",
      );

      // Set fake DeFi collateral value to simulate additional profit
      const fakeDeFiValue = hre.ethers.parseUnits(
        "100",
        AAVE_ORACLE_USD_DECIMALS,
      );
      await mockAmoVaultContract.setFakeDeFiCollateralValue(fakeDeFiValue);

      // Try to withdraw more profits, this time as dUSD
      const dusdProfitAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);

      await amoManagerContract.withdrawProfits(
        mockAmoVaultContract.getAddress(),
        testAccount1,
        dusdContract.getAddress(),
        dusdProfitAmount,
      );

      const finalDusdBalance = await dusdContract.balanceOf(testAccount1);

      assert.equal(
        finalDusdBalance - initialDusdBalance,
        dusdProfitAmount,
        "Profit should be withdrawn successfully",
      );

      // We cannot withdraw even 1 more dUSD because we've withdrawn all profits
      await expect(
        amoManagerContract.withdrawProfits(
          mockAmoVaultContract.getAddress(),
          testAccount1,
          dusdContract.getAddress(),
          hre.ethers.parseUnits("1", dusdInfo.decimals),
        ),
      ).to.be.revertedWithCustomError(
        amoManagerContract,
        "InsufficientProfits",
      );
    });

    it("cannot withdraw more than the available profit", async () => {
      const depositAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const amoAllocationAmount = hre.ethers.parseUnits(
        "800",
        dusdInfo.decimals,
      );
      const profitAmount = hre.ethers.parseUnits("201", fraxInfo.decimals);

      // Deposit FRAX into the MockAmoVault
      await fraxContract.approve(
        mockAmoVaultContract.getAddress(),
        depositAmount,
      );
      await mockAmoVaultContract.deposit(
        depositAmount,
        fraxContract.getAddress(),
      );

      // Allocate dUSD AMO to the MockAmoVault
      await issuerContract.increaseAmoSupply(amoAllocationAmount);
      await amoManagerContract.allocateAmo(
        mockAmoVaultContract.getAddress(),
        amoAllocationAmount,
      );

      // Now the AMO allocation and dUSD balance cancel each other out, so let's pretend we've distributed all dUSD
      await mockAmoVaultContract.mockRemoveAsset(
        dusdContract.getAddress(),
        amoAllocationAmount,
      );

      // Try to withdraw more than the available profit
      await expect(
        amoManagerContract.withdrawProfits(
          mockAmoVaultContract.getAddress(),
          testAccount1,
          fraxContract.getAddress(),
          profitAmount,
        ),
      ).to.be.revertedWithCustomError(
        amoManagerContract,
        "InsufficientProfits",
      );
    });
  });
});

/**
 * Converts an amount of a token to its value in USD, using the price oracle's decimals.
 *
 * @param amount The amount of the token to convert.
 * @param tokenInfo The information about the token.
 * @returns The value of the token in USD.
 */
function tokenValueFromAmount(amount: bigint, tokenInfo: TokenInfo): bigint {
  if (tokenInfo.decimals === AAVE_ORACLE_USD_DECIMALS) {
    return amount;
  }

  if (tokenInfo.decimals > AAVE_ORACLE_USD_DECIMALS) {
    const scaleFactor =
      10n ** BigInt(tokenInfo.decimals - AAVE_ORACLE_USD_DECIMALS);
    return amount / scaleFactor;
  } else {
    const scaleFactor =
      10n ** BigInt(AAVE_ORACLE_USD_DECIMALS - tokenInfo.decimals);
    return amount * scaleFactor;
  }
}
