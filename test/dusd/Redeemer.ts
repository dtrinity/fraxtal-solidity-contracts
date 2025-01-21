import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  CollateralVault,
  MintableERC20,
  Redeemer,
} from "../../typechain-types";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("Redeemer", () => {
  let redeemerContract: Redeemer;
  let collateralVaultContract: CollateralVault;
  let fraxContract: MintableERC20;
  let fraxInfo: TokenInfo;
  let dusdContract: MintableERC20;
  let dusdInfo: TokenInfo;
  let dusdDeployer: Address;
  let testAccount1: Address;
  let testAccount2: Address;

  beforeEach(async function () {
    await standaloneMinimalFixture();

    ({ dusdDeployer, testAccount1, testAccount2 } = await getNamedAccounts());

    const redeemerAddress = (await hre.deployments.get("Redeemer")).address;
    redeemerContract = await hre.ethers.getContractAt(
      "Redeemer",
      redeemerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const collateralVaultAddress = await redeemerContract.collateralVault();
    collateralVaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    ({ contract: fraxContract, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX"));
    ({ contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(dusdDeployer, "dUSD"));

    // Allow FRAX as collateral
    await collateralVaultContract.allowCollateral(fraxInfo.address);

    // Mint some dUSD to dusdDeployer
    await dusdContract.mint(
      dusdDeployer,
      hre.ethers.parseUnits("1000", dusdInfo.decimals),
    );

    // Deposit FRAX into the collateral vault
    await fraxContract.mint(
      dusdDeployer,
      hre.ethers.parseUnits("1000", fraxInfo.decimals),
    );
    await fraxContract.approve(
      await collateralVaultContract.getAddress(),
      hre.ethers.parseUnits("1000", fraxInfo.decimals),
    );
    await collateralVaultContract.deposit(
      hre.ethers.parseUnits("1000", fraxInfo.decimals),
      fraxInfo.address,
    );
  });

  describe("Permissioned redemption", () => {
    it("redeem for collateral", async function () {
      const redeemAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);
      const minimumFraxReceived = hre.ethers.parseUnits(
        "99",
        fraxInfo.decimals,
      ); // Assuming 1% slippage

      const dusdBalanceBefore = await dusdContract.balanceOf(dusdDeployer);
      const fraxBalanceBefore = await fraxContract.balanceOf(dusdDeployer);

      await dusdContract.approve(
        await redeemerContract.getAddress(),
        redeemAmount,
      );

      await redeemerContract.redeem(
        redeemAmount,
        fraxInfo.address,
        minimumFraxReceived,
      );

      const dusdBalanceAfter = await dusdContract.balanceOf(dusdDeployer);
      const fraxBalanceAfter = await fraxContract.balanceOf(dusdDeployer);

      assert.equal(
        dusdBalanceAfter,
        dusdBalanceBefore - redeemAmount,
        "dUSD balance did not decrease by the expected amount",
      );
      assert.isTrue(
        fraxBalanceAfter - fraxBalanceBefore >= minimumFraxReceived,
        "FRAX received is less than the minimum expected",
      );
    });

    it("fails when slippage is too high", async function () {
      const redeemAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);
      const impossibleMinimumFraxReceived = hre.ethers.parseUnits(
        "101",
        fraxInfo.decimals,
      ); // Impossible slippage

      await dusdContract.approve(
        await redeemerContract.getAddress(),
        redeemAmount,
      );

      await expect(
        redeemerContract.redeem(
          redeemAmount,
          fraxInfo.address,
          impossibleMinimumFraxReceived,
        ),
      ).to.be.revertedWithCustomError(redeemerContract, "SlippageTooHigh");
    });

    it("only redemption manager can redeem", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const redeemAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);
      const minimumFraxReceived = hre.ethers.parseUnits(
        "99",
        fraxInfo.decimals,
      );

      await expect(
        redeemerContract
          .connect(normalUser)
          .redeem(redeemAmount, fraxInfo.address, minimumFraxReceived),
      ).to.be.revertedWithCustomError(
        redeemerContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("dusdAmountToUsdValue converts correctly", async function () {
      const dusdPriceOracle = await hre.ethers.getContractAt(
        "MockStaticOracleWrapper",
        await redeemerContract.oracle(),
        await hre.ethers.getSigner(dusdDeployer),
      );

      const dusdAmount = hre.ethers.parseUnits("100", dusdInfo.decimals); // 100 dUSD
      const dusdPrice = await dusdPriceOracle.getAssetPrice(dusdInfo.address);
      const expectedUsdValue =
        (dusdAmount * dusdPrice) / 10n ** BigInt(dusdInfo.decimals);

      const actualUsdValue =
        await redeemerContract.dusdAmountToUsdValue(dusdAmount);

      assert.equal(
        actualUsdValue,
        expectedUsdValue,
        "dUSD to USD conversion is incorrect",
      );
    });
  });

  describe("Management", () => {
    it("only admin can set collateral vault", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);

      await expect(
        redeemerContract.connect(normalUser).setCollateralVault(testAccount2),
      ).to.be.revertedWithCustomError(
        redeemerContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("only admin can set oracle", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);

      await expect(
        redeemerContract.connect(normalUser).setOracle(testAccount2),
      ).to.be.revertedWithCustomError(
        redeemerContract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });
});
