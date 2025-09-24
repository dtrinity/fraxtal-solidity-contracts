import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { API3Wrapper, MockAPI3Oracle } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { API3_HEARTBEAT_SECONDS } from "../../utils/oracle_aggregator/constants";
import { TokenInfo } from "../../utils/token";
import { api3OracleFixture } from "./fixtures";

describe("API3Wrappers", () => {
  let api3WrapperContract: API3Wrapper;
  // let api3WrapperWithThresholdingContract: API3WrapperWithThresholding;
  let mockAPI3OracleFRAXContract: MockAPI3Oracle;
  let fraxInfo: TokenInfo;
  let sfraxInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async function () {
    const { api3WrapperAddress, mockAPI3OracleFRAXAddress, fraxToken, sfraxToken } = await api3OracleFixture();
    fraxInfo = fraxToken;
    sfraxInfo = sfraxToken;

    ({ dusdDeployer } = await getNamedAccounts());

    api3WrapperContract = await hre.ethers.getContractAt("API3Wrapper", api3WrapperAddress, await hre.ethers.getSigner(dusdDeployer));

    // api3WrapperWithThresholdingContract = await hre.ethers.getContractAt(
    //   "API3WrapperWithThresholding",
    //   api3WrapperWithThresholdingAddress,
    //   await hre.ethers.getSigner(dusdDeployer),
    // );

    mockAPI3OracleFRAXContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleFRAXAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
  });

  describe("Getting asset prices", () => {
    describe("API3Wrapper", () => {
      it("should return expected prices for FRAX and sFRAX", async function () {
        const expectedPriceFrax = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);

        const { price: actualPriceFrax, isAlive: isAliveFrax } = await api3WrapperContract.getPriceInfo(fraxInfo.address);

        expect(actualPriceFrax).to.equal(expectedPriceFrax);
        expect(isAliveFrax).to.be.true;

        const expectedPriceSFrax = hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS);

        const { price: actualPriceSFrax, isAlive: isAliveSFrax } = await api3WrapperContract.getPriceInfo(sfraxInfo.address);
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
        const { isAlive } = await api3WrapperContract.getPriceInfo(fraxInfo.address);
        expect(isAlive).to.be.false;

        // getAssetPrice should revert
        await expect(api3WrapperContract.getAssetPrice(fraxInfo.address)).to.be.revertedWithCustomError(
          api3WrapperContract,
          "PriceIsStale",
        );
      });
    });

    describe("API3WrapperWithThresholding", () => {
      // TODO implement these tests
    });
  });

  describe("Base currency and units", () => {
    describe("API3Wrapper", () => {
      it("should return correct BASE_CURRENCY", async function () {
        expect(await api3WrapperContract.BASE_CURRENCY()).to.equal(hre.ethers.ZeroAddress);
      });

      it("should return correct BASE_CURRENCY_UNIT", async function () {
        const expectedUnit = hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS);
        expect(await api3WrapperContract.BASE_CURRENCY_UNIT()).to.equal(expectedUnit);
      });
    });
  });

  describe("Role based access and management", () => {
    it("should allow setting proxy by ORACLE_MANAGER_ROLE", async function () {
      const newAsset = "0x1234567890123456789012345678901234567890";
      const proxy = "0x2345678901234567890123456789012345678901";

      await api3WrapperContract.setProxy(newAsset, proxy);

      expect(await api3WrapperContract.assetToProxy(newAsset)).to.equal(proxy);
    });

    it("should revert when non-ORACLE_MANAGER tries to set proxy", async function () {
      const { testAccount1 } = await getNamedAccounts();
      const unauthorizedSigner = await hre.ethers.getSigner(testAccount1);
      const newAsset = "0x1234567890123456789012345678901234567890";
      const proxy = "0x2345678901234567890123456789012345678901";

      await expect(api3WrapperContract.connect(unauthorizedSigner).setProxy(newAsset, proxy))
        .to.be.revertedWithCustomError(api3WrapperContract, "AccessControlUnauthorizedAccount")
        .withArgs(testAccount1, await api3WrapperContract.ORACLE_MANAGER_ROLE());
    });
  });
});
