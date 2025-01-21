import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  API3CompositeWrapperWithThresholding,
  API3Wrapper,
  API3WrapperWithThresholding,
  MockAPI3Oracle,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import {
  API3_HEARTBEAT_SECONDS,
  API3_PRICE_DECIMALS,
} from "../../utils/oracle_aggregator/constants";
import { TokenInfo } from "../../utils/token";
import { api3OracleFixture } from "./fixtures";

describe("API3Wrappers", () => {
  let api3WrapperContract: API3Wrapper;
  let api3WrapperWithThresholdingContract: API3WrapperWithThresholding;
  let api3CompositeWrapperWithThresholdingContract: API3CompositeWrapperWithThresholding;
  let mockAPI3OracleFRAXContract: MockAPI3Oracle;
  let fraxInfo: TokenInfo;
  let sfraxInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async function () {
    const {
      api3WrapperAddress,
      mockAPI3OracleFRAXAddress,
      fraxToken,
      sfraxToken,
      api3WrapperWithThresholdingAddress,
      api3CompositeWrapperWithThresholdingAddress,
    } = await api3OracleFixture();
    fraxInfo = fraxToken;
    sfraxInfo = sfraxToken;

    ({ dusdDeployer } = await getNamedAccounts());

    api3WrapperContract = await hre.ethers.getContractAt(
      "API3Wrapper",
      api3WrapperAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    api3WrapperWithThresholdingContract = await hre.ethers.getContractAt(
      "API3WrapperWithThresholding",
      api3WrapperWithThresholdingAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

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
  });

  describe("Getting asset prices", () => {
    describe("API3Wrapper", () => {
      it("should return expected prices for FRAX and sFRAX", async function () {
        const expectedPriceFrax = hre.ethers.parseUnits(
          "1",
          AAVE_ORACLE_USD_DECIMALS,
        );

        const { price: actualPriceFrax, isAlive: isAliveFrax } =
          await api3WrapperContract.getPriceInfo(fraxInfo.address);

        expect(actualPriceFrax).to.equal(expectedPriceFrax);
        expect(isAliveFrax).to.be.true;

        const expectedPriceSFrax = hre.ethers.parseUnits(
          "1.1",
          AAVE_ORACLE_USD_DECIMALS,
        );

        const { price: actualPriceSFrax, isAlive: isAliveSFrax } =
          await api3WrapperContract.getPriceInfo(sfraxInfo.address);
        expect(actualPriceSFrax).to.equal(expectedPriceSFrax);
        expect(isAliveSFrax).to.be.true;
      });

      it("should revert when getting price for non-existent asset", async function () {
        const nonExistentAsset = "0x1234567890123456789012345678901234567890";
        await expect(api3WrapperContract.getPriceInfo(nonExistentAsset))
          .to.be.revertedWithCustomError(api3WrapperContract, "ProxyNotSet")
          .withArgs(nonExistentAsset);
        await expect(api3WrapperContract.getAssetPrice(nonExistentAsset))
          .to.be.revertedWithCustomError(api3WrapperContract, "ProxyNotSet")
          .withArgs(nonExistentAsset);
      });

      it("should return false or revert when price is stale", async function () {
        const price = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);

        const currentBlock = await hre.ethers.provider.getBlock("latest");

        if (!currentBlock) {
          throw new Error("Failed to get current block");
        }
        const currentTimestamp = currentBlock.timestamp;
        const staleTimestamp = currentTimestamp - API3_HEARTBEAT_SECONDS * 2; // 2 days ago

        // Set the mock oracle to return a stale price
        await mockAPI3OracleFRAXContract.setMock(price, staleTimestamp);

        // getPriceInfo should return false
        const { isAlive } = await api3WrapperContract.getPriceInfo(
          fraxInfo.address,
        );
        expect(isAlive).to.be.false;

        // getAssetPrice should revert
        await expect(
          api3WrapperContract.getAssetPrice(fraxInfo.address),
        ).to.be.revertedWithCustomError(api3WrapperContract, "PriceIsStale");
      });
    });

    describe("API3WrapperWithThresholding", () => {
      it("should return fixed price when price is above threshold", async function () {
        const api3Price = hre.ethers.parseUnits("1.2", API3_PRICE_DECIMALS);
        const fixedPrice = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);

        await mockAPI3OracleFRAXContract.setMock(
          api3Price,
          await hre.ethers.provider
            .getBlock("latest")
            .then((b) => b!.timestamp),
        );

        // getPriceInfo
        const { price, isAlive } =
          await api3WrapperWithThresholdingContract.getPriceInfo(
            fraxInfo.address,
          );

        expect(price).to.equal(fixedPrice);
        expect(isAlive).to.be.true;

        // getAssetPrice
        const assetPrice =
          await api3WrapperWithThresholdingContract.getAssetPrice(
            fraxInfo.address,
          );
        expect(assetPrice).to.equal(fixedPrice);
      });

      it("should return original price when price is below threshold", async function () {
        const api3Price = hre.ethers.parseUnits("0.99", API3_PRICE_DECIMALS);
        const expectedPrice = hre.ethers.parseUnits(
          "0.99",
          AAVE_ORACLE_USD_DECIMALS,
        );

        await mockAPI3OracleFRAXContract.setMock(
          api3Price,
          await hre.ethers.provider
            .getBlock("latest")
            .then((b) => b!.timestamp),
        );

        // getPriceInfo
        const { price, isAlive } =
          await api3WrapperWithThresholdingContract.getPriceInfo(
            fraxInfo.address,
          );

        expect(price).to.equal(expectedPrice);
        expect(isAlive).to.be.true;

        // getAssetPrice
        const assetPrice =
          await api3WrapperWithThresholdingContract.getAssetPrice(
            fraxInfo.address,
          );
        expect(assetPrice).to.equal(expectedPrice);
      });
    });

    describe("API3CompositeWrapperWithThresholding", () => {
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
        const api3PriceFrax = hre.ethers.parseUnits(
          "1.15",
          API3_PRICE_DECIMALS,
        );
        const fixedPrice = hre.ethers.parseUnits(
          "1.1",
          AAVE_ORACLE_USD_DECIMALS,
        );

        await mockAPI3OracleFRAXContract.setMock(
          api3PriceFrax,
          await hre.ethers.provider
            .getBlock("latest")
            .then((b) => b!.timestamp),
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
  });

  describe("Base currency and units", () => {
    describe("API3Wrapper", () => {
      it("should return correct BASE_CURRENCY", async function () {
        expect(await api3WrapperContract.BASE_CURRENCY()).to.equal(
          hre.ethers.ZeroAddress,
        );
      });

      it("should return correct BASE_CURRENCY_UNIT", async function () {
        const expectedUnit = hre.ethers.parseUnits(
          "1",
          AAVE_ORACLE_USD_DECIMALS,
        );
        expect(await api3WrapperContract.BASE_CURRENCY_UNIT()).to.equal(
          expectedUnit,
        );
      });
    });
  });

  describe("Role based access and management", () => {
    describe("API3WrapperWithThresholding", () => {
      it("should allow changing the fixed price and lower threshold", async function () {
        const newFixedPrice = hre.ethers.parseUnits(
          "1.3",
          AAVE_ORACLE_USD_DECIMALS,
        );
        const newLowerThreshold = hre.ethers.parseUnits(
          "1.2",
          AAVE_ORACLE_USD_DECIMALS,
        );
        await api3WrapperWithThresholdingContract.setFixedPrice(newFixedPrice);
        await api3WrapperWithThresholdingContract.setLowerThreshold(
          newLowerThreshold,
        );
        expect(
          await api3WrapperWithThresholdingContract.fixedPriceInBase(),
        ).to.equal(newFixedPrice);
        expect(
          await api3WrapperWithThresholdingContract.lowerThresholdInBase(),
        ).to.equal(newLowerThreshold);
      });

      it("should revert when non-ORACLE_MANAGER tries to change threshold or fixed price", async function () {
        const { testAccount1 } = await getNamedAccounts();
        const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);
        const newThreshold = hre.ethers.parseUnits(
          "1.2",
          AAVE_ORACLE_USD_DECIMALS,
        );
        const newFixedPrice = hre.ethers.parseUnits(
          "1.3",
          AAVE_ORACLE_USD_DECIMALS,
        );

        await expect(
          api3WrapperWithThresholdingContract
            .connect(unauthorizedSigner)
            .setLowerThreshold(newThreshold),
        )
          .to.be.revertedWithCustomError(
            api3WrapperWithThresholdingContract,
            "AccessControlUnauthorizedAccount",
          )
          .withArgs(
            testAccount1,
            await api3WrapperWithThresholdingContract.ORACLE_MANAGER_ROLE(),
          );

        await expect(
          api3WrapperWithThresholdingContract
            .connect(unauthorizedSigner)
            .setFixedPrice(newFixedPrice),
        )
          .to.be.revertedWithCustomError(
            api3WrapperWithThresholdingContract,
            "AccessControlUnauthorizedAccount",
          )
          .withArgs(
            testAccount1,
            await api3WrapperWithThresholdingContract.ORACLE_MANAGER_ROLE(),
          );
      });
    });

    describe("API3CompositeWrapperWithThresholding", () => {
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
        expect(updatedFeed.thresholds.primary.lowerThresholdInBase).to.equal(
          hre.ethers.parseUnits("0.99", AAVE_ORACLE_USD_DECIMALS),
        );
        expect(updatedFeed.thresholds.primary.fixedPriceInBase).to.equal(
          hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
        );
        expect(updatedFeed.thresholds.secondary.lowerThresholdInBase).to.equal(
          0,
        );
        expect(updatedFeed.thresholds.secondary.fixedPriceInBase).to.equal(0);

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
});
