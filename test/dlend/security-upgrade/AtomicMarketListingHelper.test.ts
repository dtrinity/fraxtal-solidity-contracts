import { expect } from "chai";
import { ethers } from "hardhat";

import { readConfig, securityUpgradeFixture } from "./fixtures";

describe("Fraxtal lending security upgrade - AtomicMarketListingHelper", () => {
  it("stages a configured reserve and refuses to enable it before it is seeded", async () => {
    const fixture = await securityUpgradeFixture();
    const { pool, poolConfigurator, helper, user1 } = fixture;

    let collateralAsset = "";

    for (const asset of fixture.reservesList) {
      const config = await readConfig(pool, asset);
      const token = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata", asset);
      const symbol = await token.symbol();

      if (config.ltv > 0n && symbol !== "WETH") {
        collateralAsset = asset;
        break;
      }
    }

    if (!collateralAsset) {
      throw new Error("Expected at least one collateral reserve in the local fixture.");
    }

    const reserveData = await pool.getReserveData(collateralAsset);
    const collateralToken = await ethers.getContractAt(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
      collateralAsset,
      fixture.deployer,
    );
    const decimals = await collateralToken.decimals();

    const beforeConfig = await readConfig(pool, collateralAsset);
    expect(beforeConfig.ltv).to.be.gt(0n);

    await helper.stageReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        asset: collateralAsset,
        reserveFactor: beforeConfig.reserveFactor,
        supplyCap: beforeConfig.supplyCap,
        debtCeiling: beforeConfig.debtCeiling,
      },
    ]);

    const stagedConfig = await readConfig(pool, collateralAsset);
    expect(stagedConfig.ltv).to.equal(0n);
    expect(stagedConfig.liquidationThreshold).to.equal(0n);
    expect(stagedConfig.liquidationBonus).to.equal(0n);
    expect(stagedConfig.borrowingEnabled).to.equal(false);
    expect(stagedConfig.stableBorrowingEnabled).to.equal(false);
    expect(stagedConfig.flashLoanEnabled).to.equal(false);
    expect(stagedConfig.borrowCap).to.equal(0n);
    expect(stagedConfig.borrowableInIsolation).to.equal(false);

    const seedFloor = ethers.parseUnits("1", decimals);

    await expect(
      helper.enableReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
        {
          asset: collateralAsset,
          baseLTV: beforeConfig.ltv,
          liquidationThreshold: beforeConfig.liquidationThreshold,
          liquidationBonus: beforeConfig.liquidationBonus,
          reserveFactor: beforeConfig.reserveFactor,
          borrowCap: beforeConfig.borrowCap,
          supplyCap: beforeConfig.supplyCap,
          debtCeiling: beforeConfig.debtCeiling,
          unbackedMintCap: beforeConfig.unbackedMintCap,
          liquidationProtocolFee: beforeConfig.liquidationProtocolFee,
          borrowableInIsolation: beforeConfig.borrowableInIsolation,
          borrowingEnabled: beforeConfig.borrowingEnabled,
          stableBorrowingEnabled: beforeConfig.stableBorrowingEnabled,
          flashLoanEnabled: beforeConfig.flashLoanEnabled,
          minATokenSupply: seedFloor,
        },
      ]),
    )
      .to.be.revertedWithCustomError(helper, "InsufficientATokenSupply")
      .withArgs(collateralAsset, 0n, seedFloor);

    const seedAmount = ethers.parseUnits("2", decimals);
    await (await collateralToken["mint(address,uint256)"](user1.address, seedAmount)).wait();
    await (await collateralToken.connect(user1).approve(await pool.getAddress(), seedAmount)).wait();
    await (await pool.connect(user1).supply(collateralAsset, seedAmount, user1.address, 0)).wait();

    await helper.enableReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        asset: collateralAsset,
        baseLTV: beforeConfig.ltv,
        liquidationThreshold: beforeConfig.liquidationThreshold,
        liquidationBonus: beforeConfig.liquidationBonus,
        reserveFactor: beforeConfig.reserveFactor,
        borrowCap: beforeConfig.borrowCap,
        supplyCap: beforeConfig.supplyCap,
        debtCeiling: beforeConfig.debtCeiling,
        unbackedMintCap: beforeConfig.unbackedMintCap,
        liquidationProtocolFee: beforeConfig.liquidationProtocolFee,
        borrowableInIsolation: beforeConfig.borrowableInIsolation,
        borrowingEnabled: beforeConfig.borrowingEnabled,
        stableBorrowingEnabled: beforeConfig.stableBorrowingEnabled,
        flashLoanEnabled: beforeConfig.flashLoanEnabled,
        minATokenSupply: seedAmount,
      },
    ]);

    const enabledConfig = await readConfig(pool, collateralAsset);
    expect(enabledConfig.ltv).to.equal(beforeConfig.ltv);
    expect(enabledConfig.liquidationThreshold).to.equal(beforeConfig.liquidationThreshold);
    expect(enabledConfig.liquidationBonus).to.equal(beforeConfig.liquidationBonus);
    expect(enabledConfig.reserveFactor).to.equal(beforeConfig.reserveFactor);
    expect(enabledConfig.borrowCap).to.equal(beforeConfig.borrowCap);
    expect(enabledConfig.supplyCap).to.equal(beforeConfig.supplyCap);
    expect(enabledConfig.borrowableInIsolation).to.equal(beforeConfig.borrowableInIsolation);
    expect(enabledConfig.borrowingEnabled).to.equal(beforeConfig.borrowingEnabled);
    expect(enabledConfig.stableBorrowingEnabled).to.equal(beforeConfig.stableBorrowingEnabled);
    expect(enabledConfig.flashLoanEnabled).to.equal(beforeConfig.flashLoanEnabled);

    const aToken = await ethers.getContractAt("AToken", reserveData.aTokenAddress, fixture.deployer);
    expect(await aToken.totalSupply()).to.equal(seedAmount);
  });

  it("stages a nonzero debt ceiling before seed supply so isolated enable can complete", async () => {
    const fixture = await securityUpgradeFixture();
    const { pool, poolConfigurator, helper, user1 } = fixture;

    let collateralAsset = "";

    for (const asset of fixture.reservesList) {
      const config = await readConfig(pool, asset);
      const token = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata", asset);
      const symbol = await token.symbol();

      if (config.ltv > 0n && symbol !== "WETH") {
        collateralAsset = asset;
        break;
      }
    }

    if (!collateralAsset) {
      throw new Error("Expected at least one collateral reserve in the local fixture.");
    }

    const collateralToken = await ethers.getContractAt(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
      collateralAsset,
      fixture.deployer,
    );
    const decimals = await collateralToken.decimals();

    const beforeConfig = await readConfig(pool, collateralAsset);
    const stagedDebtCeiling = 123n;
    const seedAmount = ethers.parseUnits("2", decimals);

    await helper.stageReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        asset: collateralAsset,
        reserveFactor: beforeConfig.reserveFactor,
        supplyCap: beforeConfig.supplyCap,
        debtCeiling: stagedDebtCeiling,
      },
    ]);

    const stagedConfig = await readConfig(pool, collateralAsset);
    expect(stagedConfig.debtCeiling).to.equal(stagedDebtCeiling);

    await (await collateralToken["mint(address,uint256)"](user1.address, seedAmount)).wait();
    await (await collateralToken.connect(user1).approve(await pool.getAddress(), seedAmount)).wait();
    await (await pool.connect(user1).supply(collateralAsset, seedAmount, user1.address, 0)).wait();

    await helper.enableReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        asset: collateralAsset,
        baseLTV: beforeConfig.ltv,
        liquidationThreshold: beforeConfig.liquidationThreshold,
        liquidationBonus: beforeConfig.liquidationBonus,
        reserveFactor: beforeConfig.reserveFactor,
        borrowCap: beforeConfig.borrowCap,
        supplyCap: beforeConfig.supplyCap,
        debtCeiling: stagedDebtCeiling,
        unbackedMintCap: beforeConfig.unbackedMintCap,
        liquidationProtocolFee: beforeConfig.liquidationProtocolFee,
        borrowableInIsolation: false,
        borrowingEnabled: false,
        stableBorrowingEnabled: false,
        flashLoanEnabled: false,
        minATokenSupply: seedAmount,
      },
    ]);

    const enabledConfig = await readConfig(pool, collateralAsset);
    expect(enabledConfig.debtCeiling).to.equal(stagedDebtCeiling);
  });

  it("rejects enabling a seeded reserve with a new nonzero debt ceiling that was not staged", async () => {
    const fixture = await securityUpgradeFixture();
    const { pool, poolConfigurator, helper, user1 } = fixture;

    let collateralAsset = "";

    for (const asset of fixture.reservesList) {
      const config = await readConfig(pool, asset);
      const token = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata", asset);
      const symbol = await token.symbol();

      if (config.ltv > 0n && symbol !== "WETH") {
        collateralAsset = asset;
        break;
      }
    }

    if (!collateralAsset) {
      throw new Error("Expected at least one collateral reserve in the local fixture.");
    }

    const collateralToken = await ethers.getContractAt(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
      collateralAsset,
      fixture.deployer,
    );
    const decimals = await collateralToken.decimals();

    const beforeConfig = await readConfig(pool, collateralAsset);
    const seedAmount = ethers.parseUnits("2", decimals);
    const requestedDebtCeiling = 321n;

    await helper.stageReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        asset: collateralAsset,
        reserveFactor: beforeConfig.reserveFactor,
        supplyCap: beforeConfig.supplyCap,
        debtCeiling: beforeConfig.debtCeiling,
      },
    ]);

    await (await collateralToken["mint(address,uint256)"](user1.address, seedAmount)).wait();
    await (await collateralToken.connect(user1).approve(await pool.getAddress(), seedAmount)).wait();
    await (await pool.connect(user1).supply(collateralAsset, seedAmount, user1.address, 0)).wait();

    await expect(
      helper.enableReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
        {
          asset: collateralAsset,
          baseLTV: beforeConfig.ltv,
          liquidationThreshold: beforeConfig.liquidationThreshold,
          liquidationBonus: beforeConfig.liquidationBonus,
          reserveFactor: beforeConfig.reserveFactor,
          borrowCap: beforeConfig.borrowCap,
          supplyCap: beforeConfig.supplyCap,
          debtCeiling: requestedDebtCeiling,
          unbackedMintCap: beforeConfig.unbackedMintCap,
          liquidationProtocolFee: beforeConfig.liquidationProtocolFee,
          borrowableInIsolation: false,
          borrowingEnabled: false,
          stableBorrowingEnabled: false,
          flashLoanEnabled: false,
          minATokenSupply: seedAmount,
        },
      ]),
    )
      .to.be.revertedWithCustomError(helper, "DebtCeilingMustBeStagedBeforeSeeding")
      .withArgs(collateralAsset, seedAmount, 0n, requestedDebtCeiling);
  });

  it("initializes and stages a brand-new reserve atomically", async () => {
    const fixture = await securityUpgradeFixture();
    const { pool, poolConfigurator, helper } = fixture;

    const existingReserveData = await pool.getReserveData(fixture.reservesList[0]);
    const strategyAddress = existingReserveData.interestRateStrategyAddress;

    const tokenFactory = await ethers.getContractFactory(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
      fixture.deployer,
    );
    const newToken = await tokenFactory.deploy("Atomic Listing Asset", "ALA", 18);
    await newToken.waitForDeployment();
    const newAsset = await newToken.getAddress();

    await helper.initAndStageReserves(await pool.getAddress(), await poolConfigurator.getAddress(), [
      {
        aTokenImpl: fixture.aTokenImplAddress,
        stableDebtTokenImpl: fixture.stableDebtTokenImplAddress,
        variableDebtTokenImpl: fixture.variableDebtTokenImplAddress,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: strategyAddress,
        underlyingAsset: newAsset,
        treasury: fixture.treasuryAddress,
        incentivesController: ethers.ZeroAddress,
        aTokenName: "dTRINITY Lend Atomic Listing Asset",
        aTokenSymbol: "dALA",
        variableDebtTokenName: "dTRINITY Variable Debt ALA",
        variableDebtTokenSymbol: "variableDebtALA",
        stableDebtTokenName: "dTRINITY Stable Debt ALA",
        stableDebtTokenSymbol: "stableDebtALA",
        params: "0x10",
        reserveFactor: 1000n,
        supplyCap: 1000n,
        debtCeiling: 456n,
      },
    ]);

    const newReserveData = await pool.getReserveData(newAsset);
    expect(newReserveData.aTokenAddress).to.not.equal(ethers.ZeroAddress);

    const newConfig = await readConfig(pool, newAsset);
    expect(newConfig.active).to.equal(true);
    expect(newConfig.paused).to.equal(false);
    expect(newConfig.frozen).to.equal(false);
    expect(newConfig.ltv).to.equal(0n);
    expect(newConfig.liquidationThreshold).to.equal(0n);
    expect(newConfig.liquidationBonus).to.equal(0n);
    expect(newConfig.borrowingEnabled).to.equal(false);
    expect(newConfig.stableBorrowingEnabled).to.equal(false);
    expect(newConfig.flashLoanEnabled).to.equal(false);
    expect(newConfig.borrowCap).to.equal(0n);
    expect(newConfig.supplyCap).to.equal(1000n);
    expect(newConfig.reserveFactor).to.equal(1000n);
    expect(newConfig.debtCeiling).to.equal(456n);
  });
});
