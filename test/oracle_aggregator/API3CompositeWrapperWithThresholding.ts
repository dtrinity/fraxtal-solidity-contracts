import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  API3CompositeWrapperWithThresholding,
  MockAPI3Oracle,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import {
  API3_HEARTBEAT_SECONDS,
  API3_PRICE_DECIMALS,
} from "../../utils/oracle_aggregator/constants";
import { TokenInfo } from "../../utils/token";
import { api3OracleFixture } from "./fixtures";

describe("API3CompositeWrapperWithThresholding", () => {
  let api3CompositeWrapperWithThresholdingContract: API3CompositeWrapperWithThresholding;
  let mockAPI3OracleFRAXContract: MockAPI3Oracle;
  let mockAPI3OracleSFRAXContract: MockAPI3Oracle;
  let sfraxInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async function () {
    const {
      mockAPI3OracleFRAXAddress,
      mockAPI3OracleSFRAXAddress,
      sfraxToken,
      api3CompositeWrapperWithThresholdingAddress,
    } = await api3OracleFixture();
    sfraxInfo = sfraxToken;

    ({ dusdDeployer } = await getNamedAccounts());

    api3CompositeWrapperWithThresholdingContract =
      await hre.ethers.getContractAt(
        "API3CompositeWrapperWithThresholding",
        api3CompositeWrapperWithThresholdingAddress,
        await hre.ethers.getSigner(dusdDeployer),
      );

    mockAPI3OracleFRAXContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleFRAXAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    mockAPI3OracleSFRAXContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleSFRAXAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
  });

  describe("Getting asset prices", () => {
    it("should return expected composite price for sFRAX", async function () {
      const expectedPriceSFrax = hre.ethers.parseUnits(
        "1.1",
        AAVE_ORACLE_USD_DECIMALS,
      );

      const { price: actualPriceSFrax, isAlive: isAliveSFrax } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );

      expect(actualPriceSFrax).to.equal(expectedPriceSFrax);
      expect(isAliveSFrax).to.be.true;

      const assetPrice =
        await api3CompositeWrapperWithThresholdingContract.getAssetPrice(
          sfraxInfo.address,
        );
      expect(assetPrice).to.equal(expectedPriceSFrax);
    });

    it("should return fixed price when composite price is above threshold", async function () {
      // Mock the price of FRAX above $1
      const api3PriceFrax = hre.ethers.parseUnits("1.15", API3_PRICE_DECIMALS);
      const fixedPrice = hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS);

      await mockAPI3OracleFRAXContract.setMock(
        api3PriceFrax,
        await hre.ethers.provider.getBlock("latest").then((b) => b!.timestamp),
      );

      const { price, isAlive } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );

      expect(price).to.equal(fixedPrice);
      expect(isAlive).to.be.true;

      const assetPrice =
        await api3CompositeWrapperWithThresholdingContract.getAssetPrice(
          sfraxInfo.address,
        );
      expect(assetPrice).to.equal(fixedPrice);
    });

    it("should correctly handle thresholding with 8 decimal precision for both primary and secondary thresholds", async function () {
      const newAsset = "0x1234567890123456789012345678901234567890";
      const proxy1 = "0x2345678901234567890123456789012345678901";
      const proxy2 = "0x3456789012345678901234567890123456789012";

      // Set thresholds with 8 decimal precision
      const lowerThreshold1 = hre.ethers.parseUnits(
        "0.99",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $0.99
      const fixedPrice1 = hre.ethers.parseUnits(
        "1.00",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $1.00
      const lowerThreshold2 = hre.ethers.parseUnits(
        "0.98",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $0.98
      const fixedPrice2 = hre.ethers.parseUnits(
        "1.00",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $1.00

      // Add composite feed with thresholds
      await api3CompositeWrapperWithThresholdingContract.addCompositeFeed(
        newAsset,
        proxy1,
        proxy2,
        lowerThreshold1,
        fixedPrice1,
        lowerThreshold2,
        fixedPrice2,
      );

      // Verify the thresholds were set correctly
      const feed =
        await api3CompositeWrapperWithThresholdingContract.compositeFeeds(
          newAsset,
        );
      expect(feed.primaryThreshold.lowerThresholdInBase).to.equal(
        lowerThreshold1,
      );
      expect(feed.primaryThreshold.fixedPriceInBase).to.equal(fixedPrice1);
      expect(feed.secondaryThreshold.lowerThresholdInBase).to.equal(
        lowerThreshold2,
      );
      expect(feed.secondaryThreshold.fixedPriceInBase).to.equal(fixedPrice2);
    });

    it("should apply thresholds correctly for both primary and secondary prices", async function () {
      // Set thresholds with 8 decimal precision
      const lowerThreshold1 = hre.ethers.parseUnits(
        "0.99",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $0.99
      const fixedPrice1 = hre.ethers.parseUnits(
        "1.00",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $1.00
      const lowerThreshold2 = hre.ethers.parseUnits(
        "0.98",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $0.98
      const fixedPrice2 = hre.ethers.parseUnits(
        "1.00",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $1.00

      // Add composite feed with thresholds
      await api3CompositeWrapperWithThresholdingContract.addCompositeFeed(
        sfraxInfo.address,
        await mockAPI3OracleSFRAXContract.getAddress(),
        await mockAPI3OracleFRAXContract.getAddress(),
        lowerThreshold1,
        fixedPrice1,
        lowerThreshold2,
        fixedPrice2,
      );

      // Set prices ABOVE thresholds to trigger fixed price mechanism
      const price1 = hre.ethers.parseUnits("1.02", API3_PRICE_DECIMALS); // Above threshold1
      const price2 = hre.ethers.parseUnits("1.05", API3_PRICE_DECIMALS); // Above threshold2
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      await mockAPI3OracleSFRAXContract.setMock(price1, currentBlock.timestamp);
      await mockAPI3OracleFRAXContract.setMock(price2, currentBlock.timestamp);

      // Get price info
      const { price, isAlive } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );

      // Both prices should be fixed to their respective fixed prices since they're above thresholds
      // Expected: fixedPrice1 * fixedPrice2 / BASE_CURRENCY_UNIT
      const expectedPrice =
        (fixedPrice1 * fixedPrice2) /
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
      expect(price).to.equal(expectedPrice);
      expect(isAlive).to.be.true;

      // Test that a price below threshold passes through unchanged
      const priceBelowThreshold1 = hre.ethers.parseUnits(
        "0.95",
        API3_PRICE_DECIMALS,
      ); // Below threshold1
      await mockAPI3OracleSFRAXContract.setMock(
        priceBelowThreshold1,
        currentBlock.timestamp,
      );

      const { price: priceWithOneBelow } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );

      // Now price1 should be unchanged (0.95) while price2 is still fixed at 1.00
      const expectedPriceWithOneBelow =
        (hre.ethers.parseUnits("0.95", AAVE_ORACLE_USD_DECIMALS) *
          fixedPrice2) /
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
      expect(priceWithOneBelow).to.equal(expectedPriceWithOneBelow);
    });

    it("should apply threshold correctly when only price1 has threshold", async function () {
      // Set threshold only for price1
      const lowerThreshold1 = hre.ethers.parseUnits(
        "0.99",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $0.99
      const fixedPrice1 = hre.ethers.parseUnits(
        "1.00",
        AAVE_ORACLE_USD_DECIMALS,
      ); // $1.00
      const noThreshold = 0n;

      // Add composite feed with threshold only on price1
      await api3CompositeWrapperWithThresholdingContract.addCompositeFeed(
        sfraxInfo.address,
        await mockAPI3OracleSFRAXContract.getAddress(),
        await mockAPI3OracleFRAXContract.getAddress(),
        lowerThreshold1,
        fixedPrice1,
        noThreshold,
        noThreshold,
      );

      const currentBlock = await hre.ethers.provider.getBlock("latest");
      if (!currentBlock) throw new Error("Failed to get current block");

      // Test when price1 is above threshold
      const price1Above = hre.ethers.parseUnits("1.02", API3_PRICE_DECIMALS);
      const price2 = hre.ethers.parseUnits("1.05", API3_PRICE_DECIMALS);

      await mockAPI3OracleSFRAXContract.setMock(
        price1Above,
        currentBlock.timestamp,
      );
      await mockAPI3OracleFRAXContract.setMock(price2, currentBlock.timestamp);

      const { price: priceWithAboveThreshold } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );

      // price1 should be fixed at 1.00, price2 should be unchanged at 1.05
      const expectedPriceAbove =
        (fixedPrice1 *
          hre.ethers.parseUnits("1.05", AAVE_ORACLE_USD_DECIMALS)) /
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
      expect(priceWithAboveThreshold).to.equal(expectedPriceAbove);

      // Test when price1 is below threshold
      const price1Below = hre.ethers.parseUnits("0.95", API3_PRICE_DECIMALS);
      await mockAPI3OracleSFRAXContract.setMock(
        price1Below,
        currentBlock.timestamp,
      );

      const { price: priceWithBelowThreshold } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );

      // price1 should be unchanged at 0.95, price2 should be unchanged at 1.05
      const expectedPriceBelow =
        (hre.ethers.parseUnits("0.95", AAVE_ORACLE_USD_DECIMALS) *
          hre.ethers.parseUnits("1.05", AAVE_ORACLE_USD_DECIMALS)) /
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
      expect(priceWithBelowThreshold).to.equal(expectedPriceBelow);
    });

    it("should revert when getting price for non-existent asset", async function () {
      const nonExistentAsset = "0x1234567890123456789012345678901234567890";
      await expect(
        api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          nonExistentAsset,
        ),
      )
        .to.be.revertedWithCustomError(
          api3CompositeWrapperWithThresholdingContract,
          "FeedNotSet",
        )
        .withArgs(nonExistentAsset);
      await expect(
        api3CompositeWrapperWithThresholdingContract.getAssetPrice(
          nonExistentAsset,
        ),
      )
        .to.be.revertedWithCustomError(
          api3CompositeWrapperWithThresholdingContract,
          "FeedNotSet",
        )
        .withArgs(nonExistentAsset);
    });

    it("should return false or revert when price is stale", async function () {
      const price = hre.ethers.parseUnits("1", API3_PRICE_DECIMALS);
      const currentBlock = await hre.ethers.provider.getBlock("latest");

      if (!currentBlock) {
        throw new Error("Failed to get current block");
      }
      const currentTimestamp = currentBlock.timestamp;
      const staleTimestamp = currentTimestamp - API3_HEARTBEAT_SECONDS * 2; // 2 days ago

      // Set one of the mock oracles to return a stale price
      await mockAPI3OracleFRAXContract.setMock(price, staleTimestamp);

      // getPriceInfo should return false
      const { isAlive } =
        await api3CompositeWrapperWithThresholdingContract.getPriceInfo(
          sfraxInfo.address,
        );
      expect(isAlive).to.be.false;

      // getAssetPrice should revert
      await expect(
        api3CompositeWrapperWithThresholdingContract.getAssetPrice(
          sfraxInfo.address,
        ),
      ).to.be.revertedWithCustomError(
        api3CompositeWrapperWithThresholdingContract,
        "PriceIsStale",
      );
    });
  });

  describe("Role based access and management", () => {
    it("should allow adding, updating and removing composite feeds", async function () {
      const newAsset = "0x1234567890123456789012345678901234567890";
      const proxy1 = "0x2345678901234567890123456789012345678901";
      const proxy2 = "0x3456789012345678901234567890123456789012";

      await expect(
        api3CompositeWrapperWithThresholdingContract.addCompositeFeed(
          newAsset,
          proxy1,
          proxy2,
          0,
          0,
          0,
          0,
        ),
      )
        .to.emit(
          api3CompositeWrapperWithThresholdingContract,
          "CompositeFeedAdded",
        )
        .withArgs(newAsset, proxy1, proxy2, 0, 0, 0, 0);

      const feed =
        await api3CompositeWrapperWithThresholdingContract.compositeFeeds(
          newAsset,
        );
      expect(feed.proxy1).to.equal(proxy1);
      expect(feed.proxy2).to.equal(proxy2);

      await expect(
        api3CompositeWrapperWithThresholdingContract.updateCompositeFeed(
          newAsset,
          hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
          0n,
          0n,
        ),
      )
        .to.emit(
          api3CompositeWrapperWithThresholdingContract,
          "CompositeFeedUpdated",
        )
        .withArgs(
          newAsset,
          hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
          0n,
          0n,
        );

      const updatedFeed =
        await api3CompositeWrapperWithThresholdingContract.compositeFeeds(
          newAsset,
        );
      expect(updatedFeed.proxy1).to.equal(proxy1);
      expect(updatedFeed.proxy2).to.equal(proxy2);
      expect(updatedFeed.primaryThreshold.lowerThresholdInBase).to.equal(
        hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(updatedFeed.primaryThreshold.fixedPriceInBase).to.equal(
        hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
      );
      expect(updatedFeed.secondaryThreshold.lowerThresholdInBase).to.equal(0);
      expect(updatedFeed.secondaryThreshold.fixedPriceInBase).to.equal(0);

      await expect(
        api3CompositeWrapperWithThresholdingContract.removeCompositeFeed(
          newAsset,
        ),
      )
        .to.emit(
          api3CompositeWrapperWithThresholdingContract,
          "CompositeFeedRemoved",
        )
        .withArgs(newAsset);

      const removedFeed =
        await api3CompositeWrapperWithThresholdingContract.compositeFeeds(
          newAsset,
        );
      expect(removedFeed.proxy1).to.equal(hre.ethers.ZeroAddress);
      expect(removedFeed.proxy2).to.equal(hre.ethers.ZeroAddress);
    });

    it("should revert when non-ORACLE_MANAGER tries to add or remove feeds", async function () {
      const { testAccount1 } = await getNamedAccounts();
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);
      const newAsset = "0x1234567890123456789012345678901234567890";
      const proxy1 = "0x2345678901234567890123456789012345678901";
      const proxy2 = "0x3456789012345678901234567890123456789012";

      await expect(
        api3CompositeWrapperWithThresholdingContract
          .connect(unauthorizedSigner)
          .addCompositeFeed(newAsset, proxy1, proxy2, 0, 0, 0, 0),
      )
        .to.be.revertedWithCustomError(
          api3CompositeWrapperWithThresholdingContract,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          testAccount1,
          await api3CompositeWrapperWithThresholdingContract.ORACLE_MANAGER_ROLE(),
        );

      await expect(
        api3CompositeWrapperWithThresholdingContract
          .connect(unauthorizedSigner)
          .removeCompositeFeed(newAsset),
      )
        .to.be.revertedWithCustomError(
          api3CompositeWrapperWithThresholdingContract,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          testAccount1,
          await api3CompositeWrapperWithThresholdingContract.ORACLE_MANAGER_ROLE(),
        );
    });
  });
});
