import { expect } from "chai";
import { ethers } from "hardhat";

describe("DLoopCoreDLend.getTotalCollateralAndDebtOfUserInBase — per-asset only", function () {
  let Collateral: any;
  let Debt: any;
  let Other: any;
  let USDT: any;
  let collateral: any;
  let debt: any;
  let other: any;
  let usdt: any;
  let aCollateral: any;
  let varDebtToken: any;
  let stableDebtToken: any;
  let aOther: any;
  let aUSDT: any;
  let varUSDTDebt: any;

  let MockPool: any;
  let pool: any;
  let PriceOracle: any;
  let priceOracle: any;
  let AddressesProvider: any;
  let addressesProvider: any;
  let DLoopCoreDLendHarness: any;
  let dloop: any;
  let user: any;
  let admin: any;

  beforeEach(async function () {
    const [a, , u] = await ethers.getSigners();
    admin = a;
    user = u;

    Collateral = await ethers.getContractFactory("TestMintableERC20");
    Debt = await ethers.getContractFactory("TestMintableERC20");
    Other = await ethers.getContractFactory("TestMintableERC20");
    USDT = await ethers.getContractFactory("TestMintableERC20");
    const AToken = await ethers.getContractFactory("TestMintableERC20");

    collateral = await Collateral.deploy("USDC", "USDC", 6);
    debt = await Debt.deploy("WETH", "WETH", 18);
    other = await Other.deploy("DAI", "DAI", 18);
    usdt = await USDT.deploy("USDT", "USDT", 6);

    aCollateral = await AToken.deploy("aUSDC", "aUSDC", 6);
    varDebtToken = await AToken.deploy("vdWETH", "vdWETH", 18);
    stableDebtToken = await AToken.deploy("sdWETH", "sdWETH", 18);
    aOther = await AToken.deploy("aDAI", "aDAI", 18);
    aUSDT = await AToken.deploy("aUSDT", "aUSDT", 6);
    varUSDTDebt = await AToken.deploy("vdUSDT", "vdUSDT", 6);

    MockPool = await ethers.getContractFactory("contracts/mocks/MockPool.sol:MockPool");
    pool = await MockPool.deploy();
    await pool["setReserveData(address,address,address,address)"](
      await collateral.getAddress(),
      await aCollateral.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    );
    await pool["setReserveData(address,address,address,address)"](
      await debt.getAddress(),
      ethers.ZeroAddress,
      await stableDebtToken.getAddress(),
      await varDebtToken.getAddress(),
    );
    await pool["setReserveData(address,address,address,address)"](
      await other.getAddress(),
      await aOther.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
    );
    await pool["setReserveData(address,address,address,address)"](
      await usdt.getAddress(),
      await aUSDT.getAddress(),
      ethers.ZeroAddress,
      await varUSDTDebt.getAddress(),
    );

    PriceOracle = await ethers.getContractFactory("MockPriceOracleGetter");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.setPrice(await collateral.getAddress(), 1_00000000n);
    await priceOracle.setPrice(await debt.getAddress(), 3_000_00000000n);
    await priceOracle.setPrice(await other.getAddress(), 1_00000000n);
    await priceOracle.setPrice(await usdt.getAddress(), 1_00000000n);

    AddressesProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
    addressesProvider = await AddressesProvider.deploy(await pool.getAddress(), await priceOracle.getAddress());

    DLoopCoreDLendHarness = await ethers.getContractFactory("DLoopCoreDLendHarness");
    dloop = await DLoopCoreDLendHarness.deploy(
      "DLend Vault",
      "DLV",
      await collateral.getAddress(),
      await debt.getAddress(),
      await addressesProvider.getAddress(),
      3_000_000,
      2_500_000,
      3_500_000,
      0,
      0,
      0,
      ethers.ZeroAddress,
      await collateral.getAddress(),
      ethers.ZeroAddress,
      await admin.getAddress(),
      300_000,
      100_000,
      ethers.parseEther("1"),
    );
  });

  describe("Test Case 1: Baseline per-asset calculation - exact equality", function () {
    it("baseline calculation matches manual per-asset formula", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("2000"));
      await stableDebtToken.mint(await user.getAddress(), ethers.parseEther("1000"));

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.equal(100_000_000n);
      expect(debtBase).to.equal(900_000_000_000_000n);
    });
  });

  describe("Test Case 2: Baseline for the vault address", function () {
    it("calculates correctly for vault address (address(this))", async function () {
      const vaultAddress = await dloop.getAddress();

      await aCollateral.mint(vaultAddress, 2_000_000n);
      await varDebtToken.mint(vaultAddress, ethers.parseEther("1500"));
      await stableDebtToken.mint(vaultAddress, ethers.parseEther("500"));

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(vaultAddress);

      expect(collBase).to.equal(200_000_000n);
      expect(debtBase).to.equal(600_000_000_000_000n);
    });
  });

  describe("Test Case 3: Ignore unrelated collateral donations (attack regression)", function () {
    it("ignores unrelated collateral donations (aOther)", async function () {
      await aCollateral.mint(await user.getAddress(), 5_000_000n);
      const [beforeColl, beforeDebt] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      await aOther.mint(await user.getAddress(), ethers.parseEther("1000000"));
      const [afterColl, afterDebt] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(afterColl).to.equal(beforeColl);
      expect(afterDebt).to.equal(beforeDebt);
    });

    it("massive donation attack has no effect", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("0.5"));

      const [beforeColl, beforeDebt] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      await aOther.mint(await user.getAddress(), ethers.parseEther("10000000"));
      await aUSDT.mint(await user.getAddress(), 50_000_000_000_000n);

      const [afterColl, afterDebt] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(afterColl).to.equal(beforeColl);
      expect(afterDebt).to.equal(beforeDebt);
    });
  });

  describe("Test Case 4: Ignore unrelated debt positions", function () {
    it("counts only designated debt token balances (stable + variable)", async function () {
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("10"));
      await stableDebtToken.mint(await user.getAddress(), ethers.parseEther("5"));

      const [, debtBaseBefore] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      await varUSDTDebt.mint(await user.getAddress(), 5_000_000_000n);

      const [, debtBaseAfter] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(debtBaseAfter).to.equal(debtBaseBefore);
      expect(debtBaseBefore).to.be.gt(0n);
      expect(debtBaseBefore).to.equal(4_500_000_000_000n);
    });
  });

  describe("Test Case 5: Zero positions → zeroes", function () {
    it("returns (0, 0) for zero positions", async function () {
      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.equal(0n);
      expect(debtBase).to.equal(0n);
    });

    it("returns zero collateral with debt present", async function () {
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("1"));

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.equal(0n);
      expect(debtBase).to.be.gt(0n);
    });

    it("returns zero debt with collateral present", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.be.gt(0n);
      expect(debtBase).to.equal(0n);
    });
  });

  describe("Test Case 6: Decimals sanity and mixed-decimals correctness", function () {
    it("handles mixed decimals correctly", async function () {
      await aCollateral.mint(await user.getAddress(), 1_234_567n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("0.5"));
      await stableDebtToken.mint(await user.getAddress(), ethers.parseEther("0.25"));

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.equal(123_456_700n);
      expect(debtBase).to.equal(225_000_000_000n);
    });

    it("handles different decimal combinations", async function () {
      const Token8Dec = await ethers.getContractFactory("TestMintableERC20");
      const token8 = await Token8Dec.deploy("TOKEN8", "T8", 8);
      const aToken8 = await Token8Dec.deploy("aT8", "aT8", 8);

      await pool["setReserveData(address,address,address,address)"](
        await token8.getAddress(),
        await aToken8.getAddress(),
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      );
      await priceOracle.setPrice(await token8.getAddress(), 2_00000000n);

      const dloop8 = await DLoopCoreDLendHarness.deploy(
        "DLend Vault 8",
        "DLV8",
        await token8.getAddress(),
        await debt.getAddress(),
        await addressesProvider.getAddress(),
        3_000_000,
        2_500_000,
        3_500_000,
        0,
        0,
        0,
        ethers.ZeroAddress,
        await token8.getAddress(),
        ethers.ZeroAddress,
        await admin.getAddress(),
        300_000,
        100_000,
        ethers.parseEther("1"),
      );

      await aToken8.mint(await user.getAddress(), 350_000_000n);

      const [collBase, debtBase] = await dloop8.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.equal(700_000_000n);
      expect(debtBase).to.equal(0n);
    });
  });

  describe("Test Case 7: Oracle price changes propagate", function () {
    it("reflects oracle price changes proportionally", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("1"));

      const [collBaseBefore] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      await priceOracle.setPrice(await collateral.getAddress(), 1_10000000n);
      await priceOracle.setPrice(await debt.getAddress(), 2_500_00000000n);

      const [collBaseAfter, debtBaseAfter] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBaseAfter).to.equal(110_000_000n);
      expect(collBaseAfter).to.equal((collBaseBefore * 110n) / 100n);
      expect(debtBaseAfter).to.equal(250_000_000_000n);
    });
  });

  describe("Test Case 8: Invariance under aToken direct transfer-in/out", function () {
    it("reflects aToken balance changes linearly", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);

      const [collBase1] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      await aCollateral.mint(await user.getAddress(), 10_000_000n);

      const [collBase2] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase2).to.equal(collBase1 + 1_000_000_000n);
    });
  });

  describe("Test Case 9: User vs Vault address symmetry", function () {
    it("returns same values for identical positions", async function () {
      const vaultAddress = await dloop.getAddress();

      const collAmount = 2_500_000n;
      const varDebtAmount = ethers.parseEther("0.8");
      const stableDebtAmount = ethers.parseEther("0.2");

      await aCollateral.mint(await user.getAddress(), collAmount);
      await varDebtToken.mint(await user.getAddress(), varDebtAmount);
      await stableDebtToken.mint(await user.getAddress(), stableDebtAmount);

      await aCollateral.mint(vaultAddress, collAmount);
      await varDebtToken.mint(vaultAddress, varDebtAmount);
      await stableDebtToken.mint(vaultAddress, stableDebtAmount);

      const [userColl, userDebt] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);
      const [vaultColl, vaultDebt] = await dloop.getTotalCollateralAndDebtOfUserInBase(vaultAddress);

      expect(userColl).to.equal(vaultColl);
      expect(userDebt).to.equal(vaultDebt);
    });
  });

  describe("Test Case 10: Price = 0 edge behavior", function () {
    it("handles zero collateral price gracefully", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("1"));

      await priceOracle.setPrice(await collateral.getAddress(), 1n);

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.be.lt(100n);
      expect(debtBase).to.be.gt(0n);
    });

    it("handles zero debt price gracefully", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("1"));

      await priceOracle.setPrice(await debt.getAddress(), 1n);

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.be.gt(0n);
      expect(debtBase).to.be.lt(1000n);
    });
  });

  describe("Test Case 11: Multiple unrelated donations do not accumulate", function () {
    it("massive multi-asset donations have no cumulative effect", async function () {
      await aCollateral.mint(await user.getAddress(), 1_000_000n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("0.1"));

      const [collBaseBefore, debtBaseBefore] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      await aOther.mint(await user.getAddress(), ethers.parseEther("1000000"));
      await aUSDT.mint(await user.getAddress(), 500_000_000_000_000n);

      await varUSDTDebt.mint(await user.getAddress(), 100_000_000_000n);

      const [collBaseAfter, debtBaseAfter] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBaseAfter).to.equal(collBaseBefore);
      expect(debtBaseAfter).to.equal(debtBaseBefore);
      expect(collBaseBefore).to.equal(100_000_000n);
      expect(debtBaseBefore).to.equal(30_000_000_000n);
    });
  });

  describe("Test Case 12: Integration smoke - leverage quote neutrality", function () {
    it("leverage calculations unaffected by donations", async function () {
      const vaultAddress = await dloop.getAddress();

      await aCollateral.mint(vaultAddress, 10_000_000n);
      await varDebtToken.mint(vaultAddress, ethers.parseEther("0.002"));

      const leverageBefore = await dloop.getCurrentLeverageBps();
      const [collBefore, debtBefore] = await dloop.getTotalCollateralAndDebtOfUserInBase(vaultAddress);

      await aOther.mint(vaultAddress, ethers.parseEther("10000000"));

      const leverageAfter = await dloop.getCurrentLeverageBps();
      const [collAfter, debtAfter] = await dloop.getTotalCollateralAndDebtOfUserInBase(vaultAddress);

      expect(leverageAfter).to.equal(leverageBefore);
      expect(collAfter).to.equal(collBefore);
      expect(debtAfter).to.equal(debtBefore);
    });
  });

  describe("Test Case 13: Parameterized edge cases", function () {
    it("handles different decimals with main tokens", async function () {
      await aCollateral.mint(await user.getAddress(), 123_456n);
      await varDebtToken.mint(await user.getAddress(), ethers.parseEther("0.001234"));

      const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

      expect(collBase).to.equal(12_345_600n);
      expect(debtBase).to.equal(370_200_000n);
    });

    it("handles various price points correctly", async function () {
      const testCases = [
        { collPrice: 50000000n, debtPrice: 100000000n },
        { collPrice: 200000000n, debtPrice: 300000000n },
        { collPrice: 500000000000n, debtPrice: 1n },
      ];

      for (const testCase of testCases) {
        await priceOracle.setPrice(await collateral.getAddress(), testCase.collPrice);
        await priceOracle.setPrice(await debt.getAddress(), testCase.debtPrice);

        await aCollateral.mint(await user.getAddress(), 1_000_000n);
        await varDebtToken.mint(await user.getAddress(), ethers.parseEther("1"));

        const [collBase, debtBase] = await dloop.getTotalCollateralAndDebtOfUserInBase(user.address);

        expect(collBase).to.be.gt(0n);
        expect(debtBase).to.be.gt(0n);
      }
    });
  });
});
