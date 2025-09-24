import chai, { assert } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { getOraclePrice } from "../../utils/dex/oracle";
import { standardUniswapV3DEXLBPLiquidityWithMockOracleFixture } from "./fixtures";
import { getMockStaticOracleWrapperContract } from "./utils.dex";
import { getTokenContractForSymbol } from "./utils.token";

describe("MockStaticOracleWrapper usage examples", function () {
  it("can set price", async function () {
    // Define the tokens and the swap fees
    const collateralTokenSymbol = "SFRAX";
    const priceDecimals = AAVE_ORACLE_USD_DECIMALS;
    const { dexDeployer, testAccount1 } = await hre.getNamedAccounts();

    await standardUniswapV3DEXLBPLiquidityWithMockOracleFixture();

    const { tokenInfo: collateralTokenInfo } = await getTokenContractForSymbol(dexDeployer, collateralTokenSymbol);

    const mockStaticOracleWrapperContract = await getMockStaticOracleWrapperContract();

    // As the price is not set, it should revert
    await chai.expect(mockStaticOracleWrapperContract.getAssetPrice(collateralTokenInfo.address)).to.be.revertedWith("No price available");

    // Set the price of the collateralToken
    await mockStaticOracleWrapperContract.setAssetPrice(collateralTokenInfo.address, ethers.parseUnits("1.1111", priceDecimals));

    // Make sure the price is set correctly (via AaveOracle, not the mock one)
    assert.equal(await getOraclePrice(testAccount1, collateralTokenInfo.address), hre.ethers.parseUnits("1.1111", priceDecimals));

    // Set the price again to make sure the price is set correctly
    await mockStaticOracleWrapperContract.setAssetPrice(collateralTokenInfo.address, ethers.parseUnits("1.2222", priceDecimals));

    // Make sure the price is set correctly (via AaveOracle, not the mock one)
    assert.equal(await getOraclePrice(testAccount1, collateralTokenInfo.address), hre.ethers.parseUnits("1.2222", priceDecimals));
  });
});
