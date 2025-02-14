import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import {
  CurveOracleWrapper,
  MockCurveStableNGPool,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { TokenInfo } from "../../utils/token";
import { curveOracleFixture } from "./fixtures";

describe("CurveOracleWrapper", () => {
  let wrapper: CurveOracleWrapper;
  let mockPool: MockCurveStableNGPool;
  let cusdcInfo: TokenInfo;
  let dusdDeployer: Address;

  beforeEach(async () => {
    const { curveWrapperAddress, mockPoolAddress, cusdcToken } =
      await curveOracleFixture();

    ({ dusdDeployer } = await getNamedAccounts());
    cusdcInfo = cusdcToken;

    wrapper = await hre.ethers.getContractAt(
      "CurveOracleWrapper",
      curveWrapperAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    mockPool = await hre.ethers.getContractAt(
      "MockCurveStableNGPool",
      mockPoolAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
  });

  describe("Getting asset prices", () => {
    it("should return correct price from pool", async () => {
      const expectedOutput = hre.ethers.parseUnits(
        "1",
        AAVE_ORACLE_USD_DECIMALS,
      );

      await wrapper.setAssetConfig(cusdcInfo.address, mockPool.target);

      // Set stored rates and price oracle values
      const rates = [
        hre.ethers.parseUnits("1.0", 18),
        hre.ethers.parseUnits("1.0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, hre.ethers.parseUnits("1.0", 18));

      const [price, isAlive] = await wrapper.getPriceInfo(cusdcInfo.address);
      expect(price).to.equal(expectedOutput);
      expect(isAlive).to.be.true;

      const assetPrice = await wrapper.getAssetPrice(cusdcInfo.address);
      expect(assetPrice).to.equal(expectedOutput);
    });

    it("should revert when price is zero", async () => {
      await wrapper.setAssetConfig(cusdcInfo.address, mockPool.target);

      // Set zero values for both stored rates and price oracle
      const rates = [
        hre.ethers.parseUnits("0", 18),
        hre.ethers.parseUnits("0", 18),
      ];
      await mockPool.setStoredRates(rates);
      await mockPool.setPriceOracle(0, 0);

      await expect(
        wrapper.getAssetPrice(cusdcInfo.address),
      ).to.be.revertedWithCustomError(wrapper, "PriceIsZero");
    });

    it("should revert when asset is not configured", async () => {
      const unconfiguredAsset = hre.ethers.Wallet.createRandom().address;
      await expect(wrapper.getPriceInfo(unconfiguredAsset))
        .to.be.revertedWithCustomError(wrapper, "AssetNotConfigured")
        .withArgs(unconfiguredAsset);
    });
  });
});
