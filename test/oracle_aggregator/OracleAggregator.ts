import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  API3Wrapper,
  MockStaticOracleWrapper,
  OracleAggregator,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { deployContract } from "../../utils/deploy";
import { TokenInfo } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { api3OracleFixture, dexOracleFixture } from "./fixtures";

describe("OracleAggregator", () => {
  let oracleAggregatorContract: OracleAggregator;
  // let dexOracleWrapperContract: DexOracleWrapper;
  let mockStaticOracleWrapperContract: MockStaticOracleWrapper;
  let fraxInfo: TokenInfo;
  let sdaiInfo: TokenInfo;
  let dusdDeployer: Address;
  let testAccount1: Address;
  let testAccount2: Address;

  beforeEach(async function () {
    await dexOracleFixture();

    ({ dusdDeployer, testAccount1, testAccount2 } = await getNamedAccounts());

    const oracleAggregatorAddress = (
      await hre.deployments.get("OracleAggregator")
    ).address;
    oracleAggregatorContract = await hre.ethers.getContractAt(
      "OracleAggregator",
      oracleAggregatorAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const dexOracleWrapperAddress = (
      await hre.deployments.get("DexOracleWrapper")
    ).address;

    ({ tokenInfo: fraxInfo } = await getTokenContractForSymbol(
      dusdDeployer,
      "FRAX",
    ));
    ({ tokenInfo: sdaiInfo } = await getTokenContractForSymbol(
      dusdDeployer,
      "sDAI",
    ));

    // Grant the OracleManager role to the deployer
    const oracleManagerRole =
      await oracleAggregatorContract.ORACLE_MANAGER_ROLE();
    await oracleAggregatorContract.grantRole(oracleManagerRole, dusdDeployer);

    // Point the OracleAggregator to the DexOracleWrapper
    await oracleAggregatorContract.setOracle(
      fraxInfo.address,
      dexOracleWrapperAddress,
    );
    await oracleAggregatorContract.setOracle(
      sdaiInfo.address,
      dexOracleWrapperAddress,
    );

    // Fetch the MockStaticOracleWrapper contract so we can use it to set prices in tests
    const mockStaticOracleWrapperAddress = (
      await hre.deployments.get("MockStaticOracleWrapper")
    ).address;
    mockStaticOracleWrapperContract = await hre.ethers.getContractAt(
      "MockStaticOracleWrapper",
      mockStaticOracleWrapperAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
  });

  describe("Getting asset prices", () => {
    it("should return expected prices for FRAX and sDAI", async function () {
      const expectedPriceFrax = hre.ethers.parseUnits(
        "1",
        AAVE_ORACLE_USD_DECIMALS,
      );
      const expectedPriceSdai = hre.ethers.parseUnits(
        "1.1",
        AAVE_ORACLE_USD_DECIMALS,
      );

      const actualPriceFrax = await oracleAggregatorContract.getAssetPrice(
        fraxInfo.address,
      );
      const actualPriceSdai = await oracleAggregatorContract.getAssetPrice(
        sdaiInfo.address,
      );

      expect(actualPriceFrax).to.equal(expectedPriceFrax);
      expect(actualPriceSdai).to.equal(expectedPriceSdai);
    });

    it("should handle changing prices", async function () {
      // Simulate a price change in the underlying oracle
      const newFraxPrice = hre.ethers.parseUnits(
        "1.05",
        AAVE_ORACLE_USD_DECIMALS,
      );
      await mockStaticOracleWrapperContract.setAssetPrice(
        fraxInfo.address,
        newFraxPrice,
      );

      const updatedPriceFrax = await oracleAggregatorContract.getAssetPrice(
        fraxInfo.address,
      );
      expect(updatedPriceFrax).to.equal(newFraxPrice);
    });

    it("should revert when getting price for non-existent asset", async function () {
      const nonExistentAsset = "0x1234567890123456789012345678901234567890";
      await expect(oracleAggregatorContract.getAssetPrice(nonExistentAsset))
        .to.be.revertedWithCustomError(oracleAggregatorContract, "OracleNotSet")
        .withArgs(nonExistentAsset);
    });

    it("should revert when price is not alive", async function () {
      // Set the price of FRAX to 0 in the MockStaticOracleWrapper
      await mockStaticOracleWrapperContract.setAssetPrice(fraxInfo.address, 0);

      // Expect the getAssetPrice call to revert
      await expect(oracleAggregatorContract.getAssetPrice(fraxInfo.address)).to
        .be.reverted;
    });
  });

  describe("Managing oracles", () => {
    it("should allow removing oracles", async function () {
      await oracleAggregatorContract.removeOracle(fraxInfo.address);
      await expect(oracleAggregatorContract.getAssetPrice(fraxInfo.address))
        .to.be.revertedWithCustomError(oracleAggregatorContract, "OracleNotSet")
        .withArgs(fraxInfo.address);
    });

    it("should revert when setting oracle with wrong decimals", async function () {
      const { address: hardPegOracleWrapperAddress } = await deployContract(
        hre,
        "HardPegOracleWrapper",
        [2e8, 1], // 2e8 is the price peg, 1 is the decimals
        undefined,
        await hre.ethers.getSigner(dusdDeployer),
        undefined,
        "HardPegOracleWrapper",
      );

      // Try to set the oracle with wrong decimals
      await expect(
        oracleAggregatorContract.setOracle(
          fraxInfo.address,
          hardPegOracleWrapperAddress,
        ),
      )
        .to.be.revertedWithCustomError(
          oracleAggregatorContract,
          "UnexpectedBaseUnit",
        )
        .withArgs(
          fraxInfo.address,
          hardPegOracleWrapperAddress,
          BigInt(10) ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          1,
        );
    });

    it("should only allow oracle manager to set oracles", async function () {
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount2);
      await expect(
        oracleAggregatorContract
          .connect(unauthorizedSigner)
          .setOracle(testAccount1, testAccount2),
      ).to.be.revertedWithCustomError(
        oracleAggregatorContract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("Base currency and units", () => {
    it("should return correct BASE_CURRENCY", async function () {
      expect(await oracleAggregatorContract.BASE_CURRENCY()).to.equal(
        hre.ethers.ZeroAddress,
      );
    });

    it("should return correct BASE_CURRENCY_UNIT", async function () {
      const expectedUnit = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
      expect(await oracleAggregatorContract.BASE_CURRENCY_UNIT()).to.equal(
        expectedUnit,
      );
    });
  });

  describe("Price info", () => {
    it("should return correct price info", async function () {
      const [price, isAlive] = await oracleAggregatorContract.getPriceInfo(
        fraxInfo.address,
      );
      expect(price).to.equal(
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });
  });

  describe("Error cases", () => {
    it("should revert when trying to get price for asset with no oracle", async function () {
      const nonExistentAsset = "0x1234567890123456789012345678901234567890";
      await expect(oracleAggregatorContract.getPriceInfo(nonExistentAsset))
        .to.be.revertedWithCustomError(oracleAggregatorContract, "OracleNotSet")
        .withArgs(nonExistentAsset);
    });
  });
});

describe("OracleAggregator using API3", () => {
  let oracleAggregatorContract: OracleAggregator;
  let api3WrapperContract: API3Wrapper;
  let fraxInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async function () {
    const { api3WrapperAddress, fraxToken } = await api3OracleFixture();

    fraxInfo = fraxToken;

    ({ dusdDeployer } = await getNamedAccounts());

    const oracleAggregatorAddress = (
      await hre.deployments.get("OracleAggregator")
    ).address;
    oracleAggregatorContract = await hre.ethers.getContractAt(
      "OracleAggregator",
      oracleAggregatorAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    api3WrapperContract = await hre.ethers.getContractAt(
      "API3Wrapper",
      api3WrapperAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    // Grant the OracleManager role to the deployer
    const oracleManagerRole =
      await oracleAggregatorContract.ORACLE_MANAGER_ROLE();
    await oracleAggregatorContract.grantRole(oracleManagerRole, dusdDeployer);

    // Point the OracleAggregator to the API3Wrapper
    await oracleAggregatorContract.setOracle(
      fraxInfo.address,
      api3WrapperAddress,
    );
  });

  it("should fetch correct priceInfo and assetPrice for FRAX", async function () {
    const expectedPrice = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);

    // Test getPriceInfo
    const { price, isAlive } = await oracleAggregatorContract.getPriceInfo(
      fraxInfo.address,
    );
    expect(price).to.equal(expectedPrice);
    expect(isAlive).to.be.true;

    // Test getAssetPrice
    const assetPrice = await oracleAggregatorContract.getAssetPrice(
      fraxInfo.address,
    );
    expect(assetPrice).to.equal(expectedPrice);

    // Verify that the price from OracleAggregator matches the price from API3Wrapper
    const api3Price = await api3WrapperContract.getAssetPrice(fraxInfo.address);
    expect(assetPrice).to.equal(api3Price);
  });
});
