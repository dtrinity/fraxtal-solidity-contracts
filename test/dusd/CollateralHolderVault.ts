import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { CollateralHolderVault, MintableERC20 } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("CollateralHolderVault", () => {
  let collateralVaultContract: CollateralHolderVault;
  let fraxContract: MintableERC20;
  let fraxInfo: TokenInfo;
  let usdcContract: MintableERC20;
  let usdcInfo: TokenInfo;
  let dusdDeployer: Address;
  let testAccount1: Address;

  beforeEach(async function () {
    await standaloneMinimalFixture();

    ({ dusdDeployer, testAccount1 } = await getNamedAccounts());

    const collateralVaultAddress = (
      await hre.deployments.get("CollateralHolderVault")
    ).address;
    collateralVaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    ({ contract: fraxContract, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX"));
    ({ contract: usdcContract, tokenInfo: usdcInfo } =
      await getTokenContractForSymbol(dusdDeployer, "USDC"));

    // Allow the collateral vault to use FRAX and USDC
    await collateralVaultContract.allowCollateral(fraxInfo.address);
    await collateralVaultContract.allowCollateral(usdcInfo.address);
  });

  describe("Depositing collateral", () => {
    it("successive successful deposits", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("420", AAVE_ORACLE_USD_DECIMALS),
      );

      // Deposit USDC
      await usdcContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("80", usdcInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("80", usdcInfo.decimals),
        usdcInfo.address,
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("500", AAVE_ORACLE_USD_DECIMALS),
      );

      // Deposit sDAI (assuming it's already set up in the beforeEach)
      const { contract: sdaiContract, tokenInfo: sdaiInfo } =
        await getTokenContractForSymbol(dusdDeployer, "sDAI");
      await collateralVaultContract.allowCollateral(sdaiInfo.address);

      await sdaiContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("100", sdaiInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("100", sdaiInfo.decimals),
        sdaiInfo.address,
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("610", AAVE_ORACLE_USD_DECIMALS),
      );
    });
  });

  describe("Withdrawing collateral", () => {
    it("only withdrawer can withdraw", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      // Withdraw some FRAX
      await collateralVaultContract.withdraw(
        hre.ethers.parseUnits("351", fraxInfo.decimals),
        fraxInfo.address,
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("69", AAVE_ORACLE_USD_DECIMALS),
      );

      // Normal user cannot withdraw
      await expect(
        collateralVaultContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .withdraw(
            hre.ethers.parseUnits("9", fraxInfo.decimals),
            fraxInfo.address,
          ),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "AccessControlUnauthorizedAccount",
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("69", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("can withdraw to a specific address using withdrawTo", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      const initialBalance = await fraxContract.balanceOf(testAccount1);

      // Withdraw some FRAX to testAccount1
      await collateralVaultContract.withdrawTo(
        testAccount1,
        hre.ethers.parseUnits("100", fraxInfo.decimals),
        fraxInfo.address,
      );

      const finalBalance = await fraxContract.balanceOf(testAccount1);

      assert.equal(
        finalBalance - initialBalance,
        hre.ethers.parseUnits("100", fraxInfo.decimals),
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("320", AAVE_ORACLE_USD_DECIMALS),
      );
    });
  });

  describe("Exchanging collateral", () => {
    it("exchange exact amount", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      // Exchange FRAX for USDC
      await usdcContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("100", usdcInfo.decimals),
      );

      await collateralVaultContract.exchangeCollateral(
        hre.ethers.parseUnits("100", usdcInfo.decimals),
        usdcInfo.address,
        hre.ethers.parseUnits("100", fraxInfo.decimals),
        fraxInfo.address,
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("420", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("exchange max amount", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      // Exchange max FRAX for USDC
      await usdcContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", usdcInfo.decimals),
      );

      await collateralVaultContract.exchangeMaxCollateral(
        hre.ethers.parseUnits("420", usdcInfo.decimals),
        usdcInfo.address,
        fraxInfo.address,
        hre.ethers.parseUnits("0", usdcInfo.decimals),
      );

      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("420", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("normal user cannot exchange exact amount", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      // Connect as testAccount1 to attempt unauthorized exchange
      await expect(
        collateralVaultContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .exchangeCollateral(
            hre.ethers.parseUnits("100", usdcInfo.decimals),
            usdcInfo.address,
            hre.ethers.parseUnits("100", fraxInfo.decimals),
            fraxInfo.address,
          ),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "AccessControlUnauthorizedAccount",
      );

      // Ensure total value hasn't changed
      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("420", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("normal user cannot exchange max amount", async function () {
      // Deposit FRAX
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        hre.ethers.parseUnits("420", fraxInfo.decimals),
      );
      await collateralVaultContract.deposit(
        hre.ethers.parseUnits("420", fraxInfo.decimals),
        fraxInfo.address,
      );

      // Connect as testAccount1 to attempt unauthorized max exchange
      await expect(
        collateralVaultContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .exchangeMaxCollateral(
            hre.ethers.parseUnits("420", usdcInfo.decimals),
            usdcInfo.address,
            fraxInfo.address,
            hre.ethers.parseUnits("0", usdcInfo.decimals),
          ),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "AccessControlUnauthorizedAccount",
      );

      // Ensure total value hasn't changed
      assert.equal(
        await collateralVaultContract.totalValue(),
        hre.ethers.parseUnits("420", AAVE_ORACLE_USD_DECIMALS),
      );
    });
  });

  describe("Management", () => {
    it("cannot manage collateral assets as a normal user", async function () {
      // Connect as testAccount1 to attempt unauthorized collateral management
      await expect(
        collateralVaultContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .allowCollateral(fraxInfo.address),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "AccessControlUnauthorizedAccount",
      );

      await expect(
        collateralVaultContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .disallowCollateral(fraxInfo.address),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("cannot set oracle as a normal user", async function () {
      // Connect as testAccount1 to attempt unauthorized oracle setting
      await expect(
        collateralVaultContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .setOracle(testAccount1),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("Error handling", () => {
    it("should revert with UnsupportedCollateral error", async function () {
      const unsupportedCollateral =
        "0x0000000000000000000000000000000000000001";
      await expect(
        collateralVaultContract.deposit(
          hre.ethers.parseUnits("100", 18),
          unsupportedCollateral,
        ),
      )
        .to.be.revertedWithCustomError(
          collateralVaultContract,
          "UnsupportedCollateral",
        )
        .withArgs(unsupportedCollateral);
    });

    it("should revert with CollateralAlreadyAllowed error", async function () {
      await expect(collateralVaultContract.allowCollateral(fraxInfo.address))
        .to.be.revertedWithCustomError(
          collateralVaultContract,
          "CollateralAlreadyAllowed",
        )
        .withArgs(fraxInfo.address);
    });

    it("should revert with CollateralAlreadyAllowed error", async function () {
      // Simulate failure by mocking the add function
      await expect(collateralVaultContract.allowCollateral(usdcInfo.address))
        .to.be.revertedWithCustomError(
          collateralVaultContract,
          "CollateralAlreadyAllowed",
        )
        .withArgs(usdcInfo.address);
    });

    it("should revert with CollateralNotSupported error", async function () {
      const unsupportedCollateral =
        "0x0000000000000000000000000000000000000003";
      await expect(
        collateralVaultContract.disallowCollateral(unsupportedCollateral),
      )
        .to.be.revertedWithCustomError(
          collateralVaultContract,
          "CollateralNotSupported",
        )
        .withArgs(unsupportedCollateral);
    });

    it("should revert with MustSupportAtLeastOneCollateral error", async function () {
      // Simulate removing all collaterals
      await collateralVaultContract.disallowCollateral(usdcInfo.address);
      await expect(
        collateralVaultContract.disallowCollateral(fraxInfo.address),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "MustSupportAtLeastOneCollateral",
      );
    });

    it("should revert with CannotWithdrawMoreValueThanDeposited error", async function () {
      await expect(
        collateralVaultContract.exchangeCollateral(
          hre.ethers.parseUnits("100", usdcInfo.decimals),
          usdcInfo.address,
          hre.ethers.parseUnits("200", fraxInfo.decimals),
          fraxInfo.address,
        ),
      )
        .to.be.revertedWithCustomError(
          collateralVaultContract,
          "CannotWithdrawMoreValueThanDeposited",
        )
        .withArgs(
          hre.ethers.parseUnits("200", fraxInfo.decimals),
          hre.ethers.parseUnits("100", usdcInfo.decimals),
        );
    });

    it("should revert with ToCollateralAmountBelowMin error", async function () {
      await expect(
        collateralVaultContract.exchangeMaxCollateral(
          hre.ethers.parseUnits("100", usdcInfo.decimals),
          usdcInfo.address,
          fraxInfo.address,
          hre.ethers.parseUnits("200", fraxInfo.decimals),
        ),
      )
        .to.be.revertedWithCustomError(
          collateralVaultContract,
          "ToCollateralAmountBelowMin",
        )
        .withArgs(
          hre.ethers.parseUnits("100", fraxInfo.decimals),
          hre.ethers.parseUnits("200", fraxInfo.decimals),
        );
    });
  });
});
