import { expect } from "chai";
import { ethers } from "hardhat";

import { securityUpgradeFixture } from "./fixtures";

describe("Fraxtal lending security upgrade - flash loan premium routing", () => {
  it("routes the full premium to treasury without bumping liquidityIndex", async () => {
    const fixture = await securityUpgradeFixture();
    const { pool, poolConfigurator, helper, user1 } = fixture;

    const seedReserveData = await pool.getReserveData(fixture.reservesList[0]);
    const strategyAddress = seedReserveData.interestRateStrategyAddress;

    const tokenFactory = await ethers.getContractFactory(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
      fixture.deployer,
    );
    const asset = await tokenFactory.deploy("Flash Loan Asset", "FLA", 18);
    await asset.waitForDeployment();
    const assetAddress = await asset.getAddress();

    await helper.initAndStageReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        aTokenImpl: fixture.aTokenImplAddress,
        stableDebtTokenImpl: fixture.stableDebtTokenImplAddress,
        variableDebtTokenImpl: fixture.variableDebtTokenImplAddress,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: strategyAddress,
        underlyingAsset: assetAddress,
        treasury: fixture.treasuryAddress,
        incentivesController: ethers.ZeroAddress,
        aTokenName: "dTRINITY Lend Flash Loan Asset",
        aTokenSymbol: "dFLA",
        variableDebtTokenName: "dTRINITY Variable Debt FLA",
        variableDebtTokenSymbol: "variableDebtFLA",
        stableDebtTokenName: "dTRINITY Stable Debt FLA",
        stableDebtTokenSymbol: "stableDebtFLA",
        params: "0x10",
        reserveFactor: 1000n,
        supplyCap: 1_000_000n,
        debtCeiling: 0n,
      },
    ]);

    const seedAmount = ethers.parseUnits("10000", 18);
    await (await asset["mint(address,uint256)"](user1.address, seedAmount)).wait();
    await (await asset.connect(user1).approve(await pool.getAddress(), seedAmount)).wait();
    await (await pool.connect(user1).supply(assetAddress, seedAmount, user1.address, 0)).wait();

    await helper.enableReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        asset: assetAddress,
        baseLTV: 0,
        liquidationThreshold: 1000,
        liquidationBonus: 10500,
        reserveFactor: 1000n,
        borrowCap: 0n,
        supplyCap: 1_000_000n,
        debtCeiling: 0n,
        unbackedMintCap: 0n,
        liquidationProtocolFee: 0n,
        borrowableInIsolation: false,
        borrowingEnabled: false,
        stableBorrowingEnabled: false,
        flashLoanEnabled: true,
        minATokenSupply: seedAmount,
      },
    ]);

    const reserveBefore = await pool.getReserveData(assetAddress);
    const aToken = await ethers.getContractAt("AToken", reserveBefore.aTokenAddress, fixture.deployer);
    const userABalanceBefore = await aToken.balanceOf(user1.address);

    const receiverFactory = await ethers.getContractFactory("MockFlashLoanSimpleReceiver", fixture.deployer);
    const receiver = await receiverFactory.deploy(await fixture.poolAddressesProvider.getAddress());
    await receiver.waitForDeployment();

    const flashAmount = ethers.parseUnits("1000", 18);
    await (await pool.flashLoanSimple(await receiver.getAddress(), assetAddress, flashAmount, "0x", 0)).wait();

    const reserveAfter = await pool.getReserveData(assetAddress);
    const userABalanceAfter = await aToken.balanceOf(user1.address);

    expect(userABalanceAfter).to.equal(userABalanceBefore);
    expect(reserveAfter.liquidityIndex).to.equal(reserveBefore.liquidityIndex);
    expect(reserveAfter.accruedToTreasury).to.be.gt(reserveBefore.accruedToTreasury);
  });
});
