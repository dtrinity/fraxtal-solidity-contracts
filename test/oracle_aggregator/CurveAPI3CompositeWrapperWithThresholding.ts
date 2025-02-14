import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  CurveAPI3CompositeWrapperWithThresholding,
  MockAPI3Oracle,
  MockCurveStableNGPool,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { API3_PRICE_DECIMALS } from "../../utils/oracle_aggregator/constants";
import { TokenInfo } from "../../utils/token";
import { curveOracleFixture } from "./fixtures";

describe("CurveAPI3CompositeWrapperWithThresholding", () => {
  let wrapper: CurveAPI3CompositeWrapperWithThresholding;
  let mockPool: MockCurveStableNGPool;
  let mockAPI3OracleUSDCContract: MockAPI3Oracle;
  let usdcInfo: TokenInfo;
  let cusdcInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async () => {
    const {
      curveAPI3CompositeWrapperWithThresholdingAddress,
      mockPoolAddress,
      mockAPI3OracleUSDCAddress,
      usdcToken,
      cusdcToken,
    } = await curveOracleFixture();
    ({ dusdDeployer } = await getNamedAccounts());
    usdcInfo = usdcToken;
    cusdcInfo = cusdcToken;

    wrapper = await hre.ethers.getContractAt(
      "CurveAPI3CompositeWrapperWithThresholding",
      curveAPI3CompositeWrapperWithThresholdingAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    mockPool = await hre.ethers.getContractAt(
      "MockCurveStableNGPool",
      mockPoolAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    mockAPI3OracleUSDCContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleUSDCAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const currentTimestamp = await hre.ethers.provider.getBlock("latest");

    if (!currentTimestamp) {
      throw new Error("Failed to get current block");
    }
    await mockAPI3OracleUSDCContract.setMock(
      hre.ethers.parseUnits("1", API3_PRICE_DECIMALS),
      currentTimestamp.timestamp,
    );
  });

  describe("Composite price functionality", () => {
    beforeEach(async () => {
      // First configure the asset in Curve wrapper
      await wrapper.setAssetConfig(cusdcInfo.address, mockPool.target);

      // Set initial stored rates and price oracle values
      const rates = [
        hre.ethers.parseUnits("1.0", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.0", 18));

      // Configure the composite feed with thresholds
      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.05", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("should calculate composite price correctly", async () => {
      // Set stored rates and price oracle for 1.1 price
      const rates = [
        hre.ethers.parseUnits("1.1", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.1", 18));

      const expectedPrice = hre.ethers.parseUnits(
        "1.1",
        AAVE_ORACLE_USD_DECIMALS,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(price).to.equal(expectedPrice);
      expect(isAlive).to.be.true;
    });

    it("should return false isAlive when API3 price is invalid", async () => {
      await mockAPI3OracleUSDCContract.setMock(0, 0); // Invalid price

      const [, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(isAlive).to.be.false;
    });

    it("should apply thresholds to both Curve and API3 prices", async () => {
      // Set Curve price above threshold
      const rates = [
        hre.ethers.parseUnits("1.2", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.2", 18));

      // Set API3 price above threshold
      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.1", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);

      // Both prices should be capped at their fixed prices (1.0 * 1.0)
      expect(price).to.equal(
        hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });

    it("should handle when only Curve price exceeds threshold", async () => {
      // Set Curve price above threshold
      const rates = [
        hre.ethers.parseUnits("1.2", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.2", 18));

      // Set API3 price below threshold
      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.0", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);

      // Curve price should be capped, API3 price should be unchanged (1.0 * 1.0)
      expect(price).to.equal(
        hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });

    it("should handle stored rates from Curve pool", async () => {
      // Set stored rates in mock pool
      const rates = [
        hre.ethers.parseUnits("1.1", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.1", 18));

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(isAlive).to.be.true;
      // Price should reflect both the stored rate and price oracle value
      expect(price).to.equal(
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("should handle price oracle values from Curve pool", async () => {
      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        hre.ethers.parseUnits("0", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("0", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("0", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("0", AAVE_ORACLE_USD_DECIMALS),
      );
      // Set stored rates and price oracle value
      const rates = [
        hre.ethers.parseUnits("1.2", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.2", 18));

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(isAlive).to.be.true;
      expect(price).to.equal(
        hre.ethers.parseUnits("1.2", AAVE_ORACLE_USD_DECIMALS),
      );
    });
  });

  describe("Threshold functionality", () => {
    beforeEach(async () => {
      await wrapper.setAssetConfig(cusdcInfo.address, mockPool.target);
    });

    it("should return fixed price when Curve price is above threshold", async () => {
      const threshold = hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);

      // Set high price using stored rates and price oracle
      const rates = [
        hre.ethers.parseUnits("1.2", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.2", 18));

      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        threshold, // curve threshold
        fixedPrice, // curve fixed price
        0, // no API3 threshold
        0, // no API3 fixed price
      );

      const [actualPrice, isAlive] = await wrapper.getPriceInfo(
        cusdcInfo.address,
      );
      expect(actualPrice).to.equal(fixedPrice);
      expect(isAlive).to.be.true;
    });

    it("should return original price when price is below threshold", async () => {
      const threshold = hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
      const expectedPrice = hre.ethers.parseUnits(
        "1.0",
        AAVE_ORACLE_USD_DECIMALS,
      );

      // Set price below threshold
      const rates = [
        hre.ethers.parseUnits("1.0", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.0", 18));

      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        threshold,
        fixedPrice,
        0,
        0,
      );

      const [actualPrice, isAlive] = await wrapper.getPriceInfo(
        cusdcInfo.address,
      );
      expect(actualPrice).to.equal(expectedPrice);
      expect(isAlive).to.be.true;
    });

    it("should not apply thresholds when no composite feed is configured", async () => {
      const expectedPrice = hre.ethers.parseUnits(
        "1.2",
        AAVE_ORACLE_USD_DECIMALS,
      );

      // Set high price
      const rates = [
        hre.ethers.parseUnits("1.2", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.2", 18));

      const [actualPrice, isAlive] = await wrapper.getPriceInfo(
        cusdcInfo.address,
      );
      expect(actualPrice).to.equal(expectedPrice);
      expect(isAlive).to.be.true;
    });

    it("should disable thresholds by setting them to zero", async () => {
      const expectedPrice = hre.ethers.parseUnits(
        "1.2",
        AAVE_ORACLE_USD_DECIMALS,
      );

      // Set high price
      const rates = [
        hre.ethers.parseUnits("1.2", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.2", 18));

      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        0,
        0,
        0,
        0,
      );

      const [actualPrice, isAlive] = await wrapper.getPriceInfo(
        cusdcInfo.address,
      );
      expect(actualPrice).to.equal(expectedPrice);
      expect(isAlive).to.be.true;
    });
  });

  describe("Configuration", () => {
    it("should revert when setting composite feed for unconfigured asset", async () => {
      const randomAddress = hre.ethers.Wallet.createRandom().address;

      await expect(
        wrapper.setCompositeFeed(
          randomAddress,
          usdcInfo.address,
          mockAPI3OracleUSDCContract.target,
          hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1.05", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
        ),
      )
        .to.be.revertedWithCustomError(wrapper, "AssetNotConfigured")
        .withArgs(randomAddress);
    });

    it("should revert when API3 price is invalid during configuration", async () => {
      await mockAPI3OracleUSDCContract.setMock(0, 0); // Invalid price

      await expect(
        wrapper.setCompositeFeed(
          cusdcInfo.address,
          usdcInfo.address,
          mockAPI3OracleUSDCContract.target,
          hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1.05", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
        ),
      )
        .to.be.revertedWithCustomError(wrapper, "API3InvalidPrice")
        .withArgs(usdcInfo.address);
    });

    it("should emit event when removing composite feed", async () => {
      await expect(wrapper.removeCompositeFeed(cusdcInfo.address))
        .to.emit(wrapper, "CompositeFeedRemoved")
        .withArgs(cusdcInfo.address);
    });
  });

  describe("Access control", () => {
    it("should revert when non-ORACLE_MANAGER tries to set config", async () => {
      const { testAccount1 } = await getNamedAccounts();
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);

      await expect(
        wrapper.connect(unauthorizedSigner).setCompositeFeed(
          cusdcInfo.address,
          usdcInfo.address,
          mockAPI3OracleUSDCContract.target,
          hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS), // curve threshold
          hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS), // curve fixed price
          hre.ethers.parseUnits("1.05", AAVE_ORACLE_USD_DECIMALS), // api3 threshold
          hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS), // api3 fixed price
        ),
      )
        .to.be.revertedWithCustomError(
          wrapper,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(testAccount1, await wrapper.ORACLE_MANAGER_ROLE());
    });

    it("should revert when non-ORACLE_MANAGER tries to remove composite feed", async () => {
      const { testAccount1 } = await getNamedAccounts();
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);

      await expect(
        wrapper
          .connect(unauthorizedSigner)
          .removeCompositeFeed(cusdcInfo.address),
      )
        .to.be.revertedWithCustomError(
          wrapper,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(testAccount1, await wrapper.ORACLE_MANAGER_ROLE());
    });
  });

  describe("Combined threshold scenarios", () => {
    beforeEach(async () => {
      await wrapper.setAssetConfig(cusdcInfo.address, mockPool.target);

      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.2", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("should handle when both prices are below thresholds", async () => {
      // Set prices below their respective thresholds
      const rates = [
        hre.ethers.parseUnits("1.05", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.05", 18));

      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.15", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(price).to.equal(
        hre.ethers.parseUnits("1.2075", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });

    it("should handle when both prices are above thresholds", async () => {
      // Set both prices above their thresholds
      const rates = [
        hre.ethers.parseUnits("1.15", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.15", 18));

      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.25", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(price).to.equal(
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });

    it("should handle when Curve price is above but API3 price is below threshold", async () => {
      // Set high Curve price using stored rates and price oracle
      const rates = [
        hre.ethers.parseUnits("1.15", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.15", 18));

      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.15", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);

      // Curve price capped at 1.0, API3 price unchanged: 1.0 * 1.15 = 1.15
      expect(price).to.equal(
        hre.ethers.parseUnits("1.15", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });

    it("should handle when API3 price is above but Curve price is below threshold", async () => {
      // Set low Curve price using stored rates and price oracle
      const rates = [
        hre.ethers.parseUnits("1.05", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.05", 18));

      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.25", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);

      // Curve price unchanged, API3 price capped: 1.05 * 1.1 = 1.155
      expect(price).to.equal(
        hre.ethers.parseUnits("1.155", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });

    it("should handle edge cases at exactly threshold values", async () => {
      // Set Curve price at threshold
      const rates = [
        hre.ethers.parseUnits("1.1", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.1", 18));
      await wrapper.setCompositeFeed(
        cusdcInfo.address,
        usdcInfo.address,
        mockAPI3OracleUSDCContract.target,
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.0", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.2", AAVE_ORACLE_USD_DECIMALS),
        hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
      );

      await mockAPI3OracleUSDCContract.setMock(
        hre.ethers.parseUnits("1.2", API3_PRICE_DECIMALS),
        (await hre.ethers.provider.getBlock("latest"))!.timestamp,
      );

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);

      // Both prices at lower threshold should acted as upper threshold: 1.1 * 1.2 = 1.32
      expect(price).to.equal(
        hre.ethers.parseUnits("1.32", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(isAlive).to.be.true;
    });
  });

  describe("Pool configuration", () => {
    it("should handle custom decimals in Curve pool", async () => {
      await mockPool.setDecimals(6);
      await wrapper.setAssetConfig(cusdcInfo.address, mockPool.target);

      // Set price with 6 decimals
      const rates = [
        hre.ethers.parseUnits("1.0", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.0", 18));

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(isAlive).to.be.true;
      expect(price).to.equal(
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
      );
    });

    it("should correctly set and retrieve pool coins", async () => {
      const coin0 = hre.ethers.Wallet.createRandom().address;
      const coin1 = hre.ethers.Wallet.createRandom().address;

      await mockPool.setCoin(0, coin0);
      await mockPool.setCoin(1, coin1);

      expect(await mockPool.coins(0)).to.equal(coin0);
      expect(await mockPool.coins(1)).to.equal(coin1);
    });
  });
});
