import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { API3WrapperWithThresholding, MockAPI3Oracle } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { API3_HEARTBEAT_SECONDS, API3_PRICE_DECIMALS } from "../../utils/oracle_aggregator/constants";
import { TokenInfo } from "../../utils/token";
import { api3OracleFixture } from "./fixtures";

describe("API3WrapperWithThresholding", () => {
  let api3WrapperWithThresholdingContract: API3WrapperWithThresholding;
  let mockAPI3OracleFRAXContract: MockAPI3Oracle;
  let fraxInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async function () {
    const { api3WrapperWithThresholdingAddress, mockAPI3OracleFRAXAddress, fraxToken } = await api3OracleFixture();
    fraxInfo = fraxToken;

    ({ dusdDeployer } = await getNamedAccounts());

    api3WrapperWithThresholdingContract = await hre.ethers.getContractAt(
      "API3WrapperWithThresholding",
      api3WrapperWithThresholdingAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    mockAPI3OracleFRAXContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleFRAXAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
  });

  describe("Getting asset prices with thresholding", () => {
    it("should return original price when no threshold is set", async function () {
      const expectedPrice = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);

      const { price: actualPrice, isAlive } = await api3WrapperWithThresholdingContract.getPriceInfo(fraxInfo.address);

      expect(actualPrice).to.equal(expectedPrice);
      expect(isAlive).to.be.true;
    });

    it("should return original price when price is below threshold", async function () {
      const lowerThreshold = hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1.00", AAVE_ORACLE_USD_DECIMALS);

      // Set threshold config
      await api3WrapperWithThresholdingContract.setThresholdConfig(fraxInfo.address, lowerThreshold, fixedPrice);

      // Set price below threshold
      const priceBelowThreshold = hre.ethers.parseUnits("0.98", API3_PRICE_DECIMALS);
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      await mockAPI3OracleFRAXContract.setMock(priceBelowThreshold, currentBlock.timestamp);

      const { price: actualPrice, isAlive } = await api3WrapperWithThresholdingContract.getPriceInfo(fraxInfo.address);

      expect(actualPrice).to.equal(hre.ethers.parseUnits("0.98", AAVE_ORACLE_USD_DECIMALS));
      expect(isAlive).to.be.true;
    });

    it("should return fixed price when price is above threshold", async function () {
      const lowerThreshold = hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1.00", AAVE_ORACLE_USD_DECIMALS);

      // Set threshold config
      await api3WrapperWithThresholdingContract.setThresholdConfig(fraxInfo.address, lowerThreshold, fixedPrice);

      // Set price above threshold
      const priceAboveThreshold = hre.ethers.parseUnits("1.02", API3_PRICE_DECIMALS);
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      await mockAPI3OracleFRAXContract.setMock(priceAboveThreshold, currentBlock.timestamp);

      const { price: actualPrice, isAlive } = await api3WrapperWithThresholdingContract.getPriceInfo(fraxInfo.address);

      expect(actualPrice).to.equal(fixedPrice);
      expect(isAlive).to.be.true;
    });

    it("should handle zero threshold configuration", async function () {
      // Set threshold config with zero values
      await api3WrapperWithThresholdingContract.setThresholdConfig(fraxInfo.address, 0, 0);

      const testPrice = hre.ethers.parseUnits("1.02", API3_PRICE_DECIMALS);
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      await mockAPI3OracleFRAXContract.setMock(testPrice, currentBlock.timestamp);

      const { price: actualPrice, isAlive } = await api3WrapperWithThresholdingContract.getPriceInfo(fraxInfo.address);

      expect(actualPrice).to.equal(hre.ethers.parseUnits("1.02", AAVE_ORACLE_USD_DECIMALS));
      expect(isAlive).to.be.true;
    });

    it("should return false or revert when price is stale", async function () {
      const lowerThreshold = hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1.00", AAVE_ORACLE_USD_DECIMALS);

      // Set threshold config
      await api3WrapperWithThresholdingContract.setThresholdConfig(fraxInfo.address, lowerThreshold, fixedPrice);

      const price = hre.ethers.parseUnits("0.98", API3_PRICE_DECIMALS);
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      const staleTimestamp = currentBlock.timestamp - API3_HEARTBEAT_SECONDS * 2;
      await mockAPI3OracleFRAXContract.setMock(price, staleTimestamp);

      // getPriceInfo should return false
      const { isAlive } = await api3WrapperWithThresholdingContract.getPriceInfo(fraxInfo.address);
      expect(isAlive).to.be.false;

      // getAssetPrice should revert
      await expect(api3WrapperWithThresholdingContract.getAssetPrice(fraxInfo.address)).to.be.revertedWithCustomError(
        api3WrapperWithThresholdingContract,
        "PriceIsStale",
      );
    });
  });

  describe("Threshold configuration management", () => {
    it("should allow setting and removing threshold config", async function () {
      const lowerThreshold = hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1.00", AAVE_ORACLE_USD_DECIMALS);

      // Set threshold config
      await expect(api3WrapperWithThresholdingContract.setThresholdConfig(fraxInfo.address, lowerThreshold, fixedPrice))
        .to.emit(api3WrapperWithThresholdingContract, "ThresholdConfigSet")
        .withArgs(fraxInfo.address, lowerThreshold, fixedPrice);

      // Verify config
      const config = await api3WrapperWithThresholdingContract.assetThresholds(fraxInfo.address);
      expect(config.lowerThresholdInBase).to.equal(lowerThreshold);
      expect(config.fixedPriceInBase).to.equal(fixedPrice);

      // Remove threshold config
      await expect(api3WrapperWithThresholdingContract.removeThresholdConfig(fraxInfo.address))
        .to.emit(api3WrapperWithThresholdingContract, "ThresholdConfigRemoved")
        .withArgs(fraxInfo.address);

      // Verify config is removed
      const removedConfig = await api3WrapperWithThresholdingContract.assetThresholds(fraxInfo.address);
      expect(removedConfig.lowerThresholdInBase).to.equal(0);
      expect(removedConfig.fixedPriceInBase).to.equal(0);
    });

    it("should revert when non-ORACLE_MANAGER tries to set threshold config", async function () {
      const { testAccount1 } = await getNamedAccounts();
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);
      const lowerThreshold = hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1.00", AAVE_ORACLE_USD_DECIMALS);

      await expect(
        api3WrapperWithThresholdingContract.connect(unauthorizedSigner).setThresholdConfig(fraxInfo.address, lowerThreshold, fixedPrice),
      )
        .to.be.revertedWithCustomError(api3WrapperWithThresholdingContract, "AccessControlUnauthorizedAccount")
        .withArgs(testAccount1, await api3WrapperWithThresholdingContract.ORACLE_MANAGER_ROLE());
    });

    it("should revert when non-ORACLE_MANAGER tries to remove threshold config", async function () {
      const { testAccount1 } = await getNamedAccounts();
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);

      await expect(api3WrapperWithThresholdingContract.connect(unauthorizedSigner).removeThresholdConfig(fraxInfo.address))
        .to.be.revertedWithCustomError(api3WrapperWithThresholdingContract, "AccessControlUnauthorizedAccount")
        .withArgs(testAccount1, await api3WrapperWithThresholdingContract.ORACLE_MANAGER_ROLE());
    });
  });
});
