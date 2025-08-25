import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  AmoManager,
  CollateralHolderVault,
  Issuer,
  MintableERC20,
  RedeemerV2,
} from "../../typechain-types";
import { ONE_HUNDRED_PERCENT_BPS } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("RedeemerV2", () => {
  let redeemerV2Contract: RedeemerV2;
  let issuerContract: Issuer;
  let collateralVaultContract: CollateralHolderVault;
  let _amoManagerContract: AmoManager;
  let fraxContract: MintableERC20;
  let fraxInfo: TokenInfo;
  let dusdContract: MintableERC20;
  let dusdInfo: TokenInfo;
  let dusdDeployer: Address;
  let testAccount1: Address;
  let testAccount2: Address;
  let feeReceiver: Address;

  beforeEach(async function () {
    await standaloneMinimalFixture();

    ({ dusdDeployer, testAccount1, testAccount2 } = await getNamedAccounts());
    feeReceiver = testAccount2; // Use testAccount2 as fee receiver

    // Get existing contracts
    const { address: oracleAddress } =
      await hre.deployments.get("OracleAggregator");
    const { address: collateralVaultAddress } = await hre.deployments.get(
      "CollateralHolderVault",
    );
    const { address: issuerAddress } = await hre.deployments.get("Issuer");

    ({ contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(dusdDeployer, "dUSD"));

    // Deploy RedeemerV2
    const initialRedemptionFeeBps = 100; // 1%
    const redeemerV2Deployment = await hre.deployments.deploy("RedeemerV2", {
      from: dusdDeployer,
      args: [
        collateralVaultAddress,
        dusdInfo.address,
        oracleAddress,
        feeReceiver,
        initialRedemptionFeeBps,
      ],
      contract: "RedeemerV2",
      autoMine: true,
    });

    redeemerV2Contract = await hre.ethers.getContractAt(
      "RedeemerV2",
      redeemerV2Deployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    );

    issuerContract = await hre.ethers.getContractAt(
      "Issuer",
      issuerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    collateralVaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    _amoManagerContract = await hre.ethers.getContractAt(
      "AmoManager",
      await issuerContract.amoManager(),
      await hre.ethers.getSigner(dusdDeployer),
    );

    ({ contract: fraxContract, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX"));

    // Allow FRAX as collateral
    await collateralVaultContract.allowCollateral(fraxInfo.address);

    // Grant COLLATERAL_WITHDRAWER_ROLE to RedeemerV2
    await collateralVaultContract.grantRole(
      await collateralVaultContract.COLLATERAL_WITHDRAWER_ROLE(),
      redeemerV2Deployment.address,
    );

    // Set up initial state: mint FRAX and issue dUSD to testAccount1
    const fraxAmount = hre.ethers.parseUnits("2000", fraxInfo.decimals);
    const minDUSD = hre.ethers.parseUnits("1000", dusdInfo.decimals);

    await fraxContract.mint(testAccount1, fraxAmount);

    await fraxContract
      .connect(await hre.ethers.getSigner(testAccount1))
      .approve(await issuerContract.getAddress(), fraxAmount);

    await issuerContract
      .connect(await hre.ethers.getSigner(testAccount1))
      .issue(fraxAmount, fraxInfo.address, minDUSD);
  });

  describe("Permissionless redemption with fees", () => {
    it("should redeem dUSD for collateral with fees", async function () {
      const dusdAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const minNetCollateral = hre.ethers.parseUnits("990", fraxInfo.decimals); // Account for 1% fee

      const userFraxBefore = await fraxContract.balanceOf(testAccount1);
      const userDusdBefore = await dusdContract.balanceOf(testAccount1);
      const feeReceiverFraxBefore = await fraxContract.balanceOf(feeReceiver);

      await dusdContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await redeemerV2Contract.getAddress(), dusdAmount);

      await redeemerV2Contract
        .connect(await hre.ethers.getSigner(testAccount1))
        .redeem(dusdAmount, fraxInfo.address, minNetCollateral);

      const userFraxAfter = await fraxContract.balanceOf(testAccount1);
      const userDusdAfter = await dusdContract.balanceOf(testAccount1);
      const feeReceiverFraxAfter = await fraxContract.balanceOf(feeReceiver);

      const fraxReceived = userFraxAfter - userFraxBefore;
      const dusdBurned = userDusdBefore - userDusdAfter;
      const feeCollected = feeReceiverFraxAfter - feeReceiverFraxBefore;

      expect(dusdBurned).to.equal(dusdAmount);
      expect(fraxReceived).to.be.gte(minNetCollateral);
      expect(feeCollected).to.be.gt(0n);

      // Fee should be approximately 1% of the total collateral
      const totalCollateral = fraxReceived + feeCollected;
      const expectedFee =
        (totalCollateral * 100n) / BigInt(ONE_HUNDRED_PERCENT_BPS); // 1%
      expect(feeCollected).to.be.closeTo(expectedFee, expectedFee / 10n); // Within 10%
    });

    it("should revert if slippage too high", async function () {
      const dusdAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const minNetCollateral = hre.ethers.parseUnits("2000", fraxInfo.decimals); // Unrealistically high

      await dusdContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await redeemerV2Contract.getAddress(), dusdAmount);

      await expect(
        redeemerV2Contract
          .connect(await hre.ethers.getSigner(testAccount1))
          .redeem(dusdAmount, fraxInfo.address, minNetCollateral),
      ).to.be.revertedWithCustomError(redeemerV2Contract, "SlippageTooHigh");
    });

    it("should revert when paused globally", async function () {
      await redeemerV2Contract.pauseRedemption();

      const dusdAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const minNetCollateral = hre.ethers.parseUnits("990", fraxInfo.decimals);

      await dusdContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await redeemerV2Contract.getAddress(), dusdAmount);

      await expect(
        redeemerV2Contract
          .connect(await hre.ethers.getSigner(testAccount1))
          .redeem(dusdAmount, fraxInfo.address, minNetCollateral),
      ).to.be.revertedWithCustomError(redeemerV2Contract, "EnforcedPause");
    });

    it("should revert when asset redemption is paused", async function () {
      await redeemerV2Contract.setAssetRedemptionPause(fraxInfo.address, true);

      const dusdAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const minNetCollateral = hre.ethers.parseUnits("990", fraxInfo.decimals);

      await dusdContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await redeemerV2Contract.getAddress(), dusdAmount);

      await expect(
        redeemerV2Contract
          .connect(await hre.ethers.getSigner(testAccount1))
          .redeem(dusdAmount, fraxInfo.address, minNetCollateral),
      ).to.be.revertedWithCustomError(
        redeemerV2Contract,
        "AssetRedemptionPaused",
      );
    });
  });

  describe("Protocol redemption (fee-less)", () => {
    it("should allow protocol redemption without fees", async function () {
      const dusdAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const minCollateral = hre.ethers.parseUnits("1000", fraxInfo.decimals);

      const userFraxBefore = await fraxContract.balanceOf(dusdDeployer);

      // First, get some dUSD to the deployer
      await dusdContract.mint(dusdDeployer, dusdAmount);
      const userDusdBefore = await dusdContract.balanceOf(dusdDeployer);

      await dusdContract.approve(
        await redeemerV2Contract.getAddress(),
        dusdAmount,
      );

      await redeemerV2Contract.redeemAsProtocol(
        dusdAmount,
        fraxInfo.address,
        minCollateral,
      );

      const userFraxAfter = await fraxContract.balanceOf(dusdDeployer);
      const userDusdAfter = await dusdContract.balanceOf(dusdDeployer);

      const fraxReceived = userFraxAfter - userFraxBefore;
      const dusdBurned = userDusdBefore - userDusdAfter;

      expect(dusdBurned).to.equal(dusdAmount);
      expect(fraxReceived).to.be.gte(minCollateral);
    });
  });

  describe("Asset-level redemption controls", () => {
    it("should allow setting asset redemption pause", async function () {
      expect(
        await redeemerV2Contract.isAssetRedemptionEnabled(fraxInfo.address),
      ).to.be.true;

      await redeemerV2Contract.setAssetRedemptionPause(fraxInfo.address, true);
      expect(
        await redeemerV2Contract.isAssetRedemptionEnabled(fraxInfo.address),
      ).to.be.false;
      expect(await redeemerV2Contract.assetRedemptionPaused(fraxInfo.address))
        .to.be.true;

      await redeemerV2Contract.setAssetRedemptionPause(fraxInfo.address, false);
      expect(
        await redeemerV2Contract.isAssetRedemptionEnabled(fraxInfo.address),
      ).to.be.true;
      expect(await redeemerV2Contract.assetRedemptionPaused(fraxInfo.address))
        .to.be.false;
    });

    it("should revert when setting pause for unsupported collateral", async function () {
      const randomAddress = "0x0000000000000000000000000000000000000001";

      await expect(
        redeemerV2Contract.setAssetRedemptionPause(randomAddress, true),
      ).to.be.revertedWithCustomError(
        collateralVaultContract,
        "UnsupportedCollateral",
      );
    });
  });

  describe("Fee management", () => {
    it("should allow updating default redemption fee", async function () {
      const newFeeBps = 200; // 2%

      await redeemerV2Contract.setDefaultRedemptionFee(newFeeBps);
      expect(await redeemerV2Contract.defaultRedemptionFeeBps()).to.equal(
        newFeeBps,
      );
    });

    it("should allow setting per-collateral redemption fees", async function () {
      const newFeeBps = 50; // 0.5%

      await redeemerV2Contract.setCollateralRedemptionFee(
        fraxInfo.address,
        newFeeBps,
      );
      expect(
        await redeemerV2Contract.collateralRedemptionFeeBps(fraxInfo.address),
      ).to.equal(newFeeBps);
      expect(
        await redeemerV2Contract.isCollateralFeeOverridden(fraxInfo.address),
      ).to.be.true;
    });

    it("should allow clearing per-collateral fee overrides", async function () {
      const newFeeBps = 50; // 0.5%

      // Set override
      await redeemerV2Contract.setCollateralRedemptionFee(
        fraxInfo.address,
        newFeeBps,
      );
      expect(
        await redeemerV2Contract.isCollateralFeeOverridden(fraxInfo.address),
      ).to.be.true;

      // Clear override
      await redeemerV2Contract.clearCollateralRedemptionFee(fraxInfo.address);
      expect(
        await redeemerV2Contract.isCollateralFeeOverridden(fraxInfo.address),
      ).to.be.false;
      expect(
        await redeemerV2Contract.collateralRedemptionFeeBps(fraxInfo.address),
      ).to.equal(0);
    });

    it("should allow updating fee receiver", async function () {
      const newFeeReceiver = testAccount1;

      await redeemerV2Contract.setFeeReceiver(newFeeReceiver);
      expect(await redeemerV2Contract.feeReceiver()).to.equal(newFeeReceiver);
    });

    it("should revert when setting fee too high", async function () {
      const maxFeeBps = await redeemerV2Contract.MAX_FEE_BPS();
      const tooHighFeeBps = maxFeeBps + 1n;

      await expect(
        redeemerV2Contract.setDefaultRedemptionFee(tooHighFeeBps),
      ).to.be.revertedWithCustomError(redeemerV2Contract, "FeeTooHigh");
    });
  });

  describe("View functions", () => {
    it("should correctly convert dUSD amount to base value", async function () {
      const dusdAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const baseValue =
        await redeemerV2Contract.dusdAmountToBaseValue(dusdAmount);
      expect(baseValue).to.be.a("bigint");
      expect(baseValue).to.be.gt(0n);
    });
  });
});
