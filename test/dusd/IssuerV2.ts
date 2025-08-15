import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  AmoManager,
  CollateralHolderVault,
  IssuerV2,
  MintableERC20,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("IssuerV2", () => {
  let issuerV2Contract: IssuerV2;
  let collateralVaultContract: CollateralHolderVault;
  let amoManagerContract: AmoManager;
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

    // Deploy IssuerV2 - we need to do this manually since it's not in the fixture
    const { address: oracleAddress } =
      await hre.deployments.get("OracleAggregator");
    const { address: collateralVaultAddress } = await hre.deployments.get(
      "CollateralHolderVault",
    );
    const { address: amoManagerAddress } =
      await hre.deployments.get("AmoManager");

    ({ contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(dusdDeployer, "dUSD"));

    const issuerV2Deployment = await hre.deployments.deploy("IssuerV2", {
      from: dusdDeployer,
      args: [
        collateralVaultAddress,
        dusdInfo.address,
        oracleAddress,
        amoManagerAddress,
      ],
      contract: "IssuerV2",
      autoMine: true,
    });

    issuerV2Contract = await hre.ethers.getContractAt(
      "IssuerV2",
      issuerV2Deployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    );

    collateralVaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    amoManagerContract = await hre.ethers.getContractAt(
      "AmoManager",
      amoManagerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    ({ contract: fraxContract, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX"));

    // Allow FRAX as collateral
    await collateralVaultContract.allowCollateral(fraxInfo.address);

    // Grant MINTER_ROLE to IssuerV2
    await dusdContract.grantRole(
      await dusdContract.MINTER_ROLE(),
      issuerV2Deployment.address,
    );

    // Mint 1000 FRAX to testAccount1
    const fraxAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
    await fraxContract.mint(testAccount1, fraxAmount);
  });

  describe("Permissionless issuance", () => {
    it("issue in exchange for collateral", async function () {
      const collateralAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      const vaultBalanceBefore = await fraxContract.balanceOf(
        await collateralVaultContract.getAddress(),
      );
      const userDusdBalanceBefore = await dusdContract.balanceOf(testAccount1);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await issuerV2Contract.getAddress(), collateralAmount);

      await issuerV2Contract
        .connect(await hre.ethers.getSigner(testAccount1))
        .issue(collateralAmount, fraxInfo.address, minDUSD);

      const vaultBalanceAfter = await fraxContract.balanceOf(
        await collateralVaultContract.getAddress(),
      );
      const userDusdBalanceAfter = await dusdContract.balanceOf(testAccount1);

      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        collateralAmount,
        "Collateral vault balance did not increase by the expected amount",
      );

      const dusdReceived = userDusdBalanceAfter - userDusdBalanceBefore;
      assert.isTrue(
        dusdReceived >= minDUSD,
        "User did not receive the expected amount of dUSD",
      );
    });

    it("should revert if slippage too high", async function () {
      const collateralAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("2000", dusdInfo.decimals); // Unrealistically high

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await issuerV2Contract.getAddress(), collateralAmount);

      await expect(
        issuerV2Contract
          .connect(await hre.ethers.getSigner(testAccount1))
          .issue(collateralAmount, fraxInfo.address, minDUSD),
      ).to.be.revertedWithCustomError(issuerV2Contract, "SlippageTooHigh");
    });

    it("should revert when paused globally", async function () {
      await issuerV2Contract.pauseMinting();

      const collateralAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await issuerV2Contract.getAddress(), collateralAmount);

      await expect(
        issuerV2Contract
          .connect(await hre.ethers.getSigner(testAccount1))
          .issue(collateralAmount, fraxInfo.address, minDUSD),
      ).to.be.revertedWith("Pausable: paused");
    });

    it("should revert when asset minting is paused", async function () {
      await issuerV2Contract.setAssetMintingPause(fraxInfo.address, true);

      const collateralAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await issuerV2Contract.getAddress(), collateralAmount);

      await expect(
        issuerV2Contract
          .connect(await hre.ethers.getSigner(testAccount1))
          .issue(collateralAmount, fraxInfo.address, minDUSD),
      ).to.be.revertedWithCustomError(issuerV2Contract, "AssetMintingPaused");
    });
  });

  describe("Asset-level minting controls", () => {
    it("should allow setting asset minting pause", async function () {
      expect(await issuerV2Contract.isAssetMintingEnabled(fraxInfo.address)).to
        .be.true;

      await issuerV2Contract.setAssetMintingPause(fraxInfo.address, true);
      expect(await issuerV2Contract.isAssetMintingEnabled(fraxInfo.address)).to
        .be.false;
      expect(await issuerV2Contract.assetMintingPaused(fraxInfo.address)).to.be
        .true;

      await issuerV2Contract.setAssetMintingPause(fraxInfo.address, false);
      expect(await issuerV2Contract.isAssetMintingEnabled(fraxInfo.address)).to
        .be.true;
      expect(await issuerV2Contract.assetMintingPaused(fraxInfo.address)).to.be
        .false;
    });

    it("should revert when setting pause for unsupported collateral", async function () {
      const randomAddress = "0x0000000000000000000000000000000000000001";

      await expect(
        issuerV2Contract.setAssetMintingPause(randomAddress, true),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "UnsupportedCollateral",
      );
    });
  });

  describe("AMO Manager integration", () => {
    it("should allow increasing AMO supply", async function () {
      const amoSupplyBefore = await amoManagerContract.totalAmoSupply();
      const dusdAmountToMint = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      await issuerV2Contract.increaseAmoSupply(dusdAmountToMint);

      const amoSupplyAfter = await amoManagerContract.totalAmoSupply();
      expect(amoSupplyAfter - amoSupplyBefore).to.equal(dusdAmountToMint);
    });
  });

  describe("Excess collateral issuance", () => {
    it("should allow issuing using excess collateral", async function () {
      // First, create some excess collateral by issuing normally
      const collateralAmount = hre.ethers.parseUnits("2000", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await issuerV2Contract.getAddress(), collateralAmount);

      await issuerV2Contract
        .connect(await hre.ethers.getSigner(testAccount1))
        .issue(collateralAmount, fraxInfo.address, minDUSD);

      // Now issue using excess collateral
      const excessDusdAmount = hre.ethers.parseUnits("500", dusdInfo.decimals);
      const userBalanceBefore = await dusdContract.balanceOf(testAccount2);

      await issuerV2Contract.issueUsingExcessCollateral(
        testAccount2,
        excessDusdAmount,
      );

      const userBalanceAfter = await dusdContract.balanceOf(testAccount2);
      expect(userBalanceAfter - userBalanceBefore).to.equal(excessDusdAmount);
    });
  });

  describe("View functions", () => {
    it("should correctly calculate circulating supply", async function () {
      const totalSupplyBefore = await dusdContract.totalSupply();
      const circulatingBefore = await issuerV2Contract.circulatingDusd();

      expect(circulatingBefore).to.equal(totalSupplyBefore);
    });

    it("should correctly report collateral value", async function () {
      const collateralValue = await issuerV2Contract.collateralInDusd();
      expect(collateralValue).to.be.a("bigint");
    });
  });
});
