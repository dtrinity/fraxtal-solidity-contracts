import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  AmoManager,
  CollateralVault,
  Issuer,
  MintableERC20,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("Issuer", () => {
  let issuerContract: Issuer;
  let collateralVaultContract: CollateralVault;
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

    const issuerAddress = (await hre.deployments.get("Issuer")).address;
    issuerContract = await hre.ethers.getContractAt(
      "Issuer",
      issuerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const collateralVaultAddress = await issuerContract.collateralVault();
    collateralVaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const amoManagerAddress = await issuerContract.amoManager();
    amoManagerContract = await hre.ethers.getContractAt(
      "AmoManager",
      amoManagerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    ({ contract: fraxContract, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX"));
    ({ contract: dusdContract, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(dusdDeployer, "dUSD"));

    // Allow FRAX as collateral
    await collateralVaultContract.allowCollateral(fraxInfo.address);

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
        .approve(await collateralVaultContract.getAddress(), collateralAmount);

      await issuerContract
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

    it("cannot issue more than user's collateral balance", async function () {
      const collateralAmount = hre.ethers.parseUnits("1001", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1001", dusdInfo.decimals);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await collateralVaultContract.getAddress(), collateralAmount);

      await expect(
        issuerContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .issue(collateralAmount, fraxInfo.address, minDUSD),
      ).to.be.reverted;
    });

    it("issueFrom on behalf of another address", async function () {
      const collateralAmount = hre.ethers.parseUnits("1000", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      const vaultBalanceBefore = await fraxContract.balanceOf(
        await collateralVaultContract.getAddress(),
      );
      const receiverDusdBalanceBefore =
        await dusdContract.balanceOf(testAccount2);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await collateralVaultContract.getAddress(), collateralAmount);

      await issuerContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .issueFrom(
          testAccount1,
          testAccount2,
          collateralAmount,
          fraxInfo.address,
          minDUSD,
        );

      const vaultBalanceAfter = await fraxContract.balanceOf(
        await collateralVaultContract.getAddress(),
      );
      const receiverDusdBalanceAfter =
        await dusdContract.balanceOf(testAccount2);

      assert.equal(
        vaultBalanceAfter - vaultBalanceBefore,
        collateralAmount,
        "Collateral vault balance did not increase by the expected amount",
      );

      const dusdReceived = receiverDusdBalanceAfter - receiverDusdBalanceBefore;
      assert.isTrue(
        dusdReceived >= minDUSD,
        "Receiver did not receive the expected amount of dUSD",
      );
    });

    it("cannot issueFrom another address for more than user's collateral balance", async function () {
      const collateralAmount = hre.ethers.parseUnits("1001", fraxInfo.decimals);
      const minDUSD = hre.ethers.parseUnits("1001", dusdInfo.decimals);

      await fraxContract
        .connect(await hre.ethers.getSigner(testAccount1))
        .approve(await collateralVaultContract.getAddress(), collateralAmount);

      await expect(
        issuerContract
          .connect(await hre.ethers.getSigner(testAccount1))
          .issueFrom(
            testAccount1,
            testAccount2,
            collateralAmount,
            fraxInfo.address,
            minDUSD,
          ),
      ).to.be.reverted;
    });

    it("circulatingDusd function calculates correctly", async function () {
      // Make sure there's some dUSD supply at the start of the test
      const collateralAmount = hre.ethers.parseUnits(
        "10000",
        fraxInfo.decimals,
      );
      const minDUSD = hre.ethers.parseUnits("10000", dusdInfo.decimals);

      await fraxContract.mint(dusdDeployer, collateralAmount);
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        collateralAmount,
      );
      await issuerContract.issue(collateralAmount, fraxInfo.address, minDUSD);

      // Mint some AMO supply
      const amoSupply = hre.ethers.parseUnits("3000", dusdInfo.decimals);
      await issuerContract.increaseAmoSupply(amoSupply);

      const totalSupply = await dusdContract.totalSupply();
      const actualAmoSupply = await amoManagerContract.totalAmoSupply();
      const expectedCirculating = totalSupply - actualAmoSupply;

      const actualCirculating = await issuerContract.circulatingDusd();

      assert.equal(
        actualCirculating,
        expectedCirculating,
        "Circulating dUSD calculation is incorrect",
      );
      assert.notEqual(
        actualCirculating,
        totalSupply,
        "Circulating dUSD should be less than total supply",
      );
      assert.notEqual(actualAmoSupply, 0n, "AMO supply should not be zero");
    });

    it("usdValueToDusdAmount converts correctly", async function () {
      const dusdPriceOracle = await hre.ethers.getContractAt(
        "MockStaticOracleWrapper",
        await issuerContract.oracle(),
        await hre.ethers.getSigner(dusdDeployer),
      );

      const usdValue = hre.ethers.parseUnits("100", AAVE_ORACLE_USD_DECIMALS); // 100 USD
      const dusdPrice = await dusdPriceOracle.getAssetPrice(dusdInfo.address);
      const expectedDusdAmount =
        (usdValue * 10n ** BigInt(dusdInfo.decimals)) / dusdPrice;

      const actualDusdAmount =
        await issuerContract.usdValueToDusdAmount(usdValue);

      assert.equal(
        actualDusdAmount,
        expectedDusdAmount,
        "USD to dUSD conversion is incorrect",
      );
    });
  });

  describe("Permissioned issuance", () => {
    it("increaseAmoSupply mints dUSD to AMO Manager", async function () {
      const initialAmoSupply = await amoManagerContract.totalAmoSupply();
      const initialAmoManagerBalance = await dusdContract.balanceOf(
        await amoManagerContract.getAddress(),
      );
      const amountToMint = hre.ethers.parseUnits("1000", dusdInfo.decimals);

      await issuerContract.increaseAmoSupply(amountToMint);

      const finalAmoSupply = await amoManagerContract.totalAmoSupply();
      const finalAmoManagerBalance = await dusdContract.balanceOf(
        await amoManagerContract.getAddress(),
      );

      assert.equal(
        finalAmoSupply - initialAmoSupply,
        amountToMint,
        "AMO supply was not increased correctly",
      );
      assert.equal(
        finalAmoManagerBalance - initialAmoManagerBalance,
        amountToMint,
        "AMO Manager balance was not increased correctly",
      );
    });

    it("issueUsingExcessCollateral mints dUSD up to excess collateral", async function () {
      // Ensure there's excess collateral
      const collateralAmount = hre.ethers.parseUnits("2000", fraxInfo.decimals);
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        collateralAmount,
      );
      await collateralVaultContract.deposit(collateralAmount, fraxInfo.address);

      const initialCirculatingDusd = await issuerContract.circulatingDusd();
      const amountToMint = hre.ethers.parseUnits("2000", dusdInfo.decimals);
      const receiver = testAccount2;
      const initialReceiverBalance = await dusdContract.balanceOf(receiver);

      await issuerContract.issueUsingExcessCollateral(receiver, amountToMint);

      const finalCirculatingDusd = await issuerContract.circulatingDusd();
      const finalReceiverBalance = await dusdContract.balanceOf(receiver);

      assert.equal(
        finalCirculatingDusd - initialCirculatingDusd,
        amountToMint,
        "Circulating dUSD was not increased correctly",
      );
      assert.equal(
        finalReceiverBalance - initialReceiverBalance,
        amountToMint,
        "Receiver balance was not increased correctly",
      );
    });

    it("issueUsingExcessCollateral cannot exceed collateral balance", async function () {
      // Ensure there's excess collateral
      const collateralAmount = hre.ethers.parseUnits("2000", fraxInfo.decimals);
      await fraxContract.approve(
        await collateralVaultContract.getAddress(),
        collateralAmount,
      );
      await collateralVaultContract.deposit(collateralAmount, fraxInfo.address);

      const amountToMint = hre.ethers.parseUnits("2001", dusdInfo.decimals);
      const receiver = testAccount2;

      await expect(
        issuerContract.issueUsingExcessCollateral(receiver, amountToMint),
      ).to.be.revertedWithCustomError(
        issuerContract,
        "IssuanceSurpassesExcessCollateral",
      );
    });
  });

  describe("Management", () => {
    it("only admin can set AMO manager", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      await expect(
        issuerContract.connect(normalUser).setAmoManager(testAccount2),
      ).to.be.revertedWithCustomError(
        issuerContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("setCollateralVault updates the collateral vault address", async function () {
      const newCollateralVault = testAccount1;

      const oldCollateralVault = await issuerContract.collateralVault();

      await issuerContract.setCollateralVault(newCollateralVault);

      const updatedCollateralVault = await issuerContract.collateralVault();

      assert.notEqual(
        oldCollateralVault,
        updatedCollateralVault,
        "CollateralVault address was not changed",
      );
      assert.equal(
        updatedCollateralVault,
        newCollateralVault,
        "CollateralVault address was not updated correctly",
      );
    });

    it("only issuance manager can set collateral vault", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      await expect(
        issuerContract.connect(normalUser).setCollateralVault(testAccount2),
      ).to.be.revertedWithCustomError(
        issuerContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("only AMO manager can increase AMO supply", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const amountToMint = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      await expect(
        issuerContract.connect(normalUser).increaseAmoSupply(amountToMint),
      ).to.be.revertedWithCustomError(
        issuerContract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("only incentives manager can issue using excess collateral", async function () {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const amountToMint = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const receiver = testAccount2;
      await expect(
        issuerContract
          .connect(normalUser)
          .issueUsingExcessCollateral(receiver, amountToMint),
      ).to.be.revertedWithCustomError(
        issuerContract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });
});
