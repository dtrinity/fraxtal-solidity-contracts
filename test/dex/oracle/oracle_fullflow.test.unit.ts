import { FeeAmount } from "@uniswap/v3-sdk";
import chai from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

import {
  AaveOracle,
  ERC20Test,
  NFTDescriptor,
  NonfungiblePositionManager,
  NonfungibleTokenPositionDescriptor,
  PoolAddressesProviderRegistry,
  StaticOracle,
  StaticOracleWrapper,
  SwapRouter,
  UniswapV3Factory,
  WETH9,
} from "../../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../utils/constants";
import { deployOracle, deployOracleWrapper, deployTestTokens } from "./utils";
import { addLiquidityToDEXPool, deployDEX, getPoolAddress, getPoolFromAddress, initDEXPool, swapExactInputSimple } from "./utils.dex";
import { deployLending } from "./utils.lending";

describe("Testing DEX Oracle as Lending fallback oracle", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.

  let dexContracts: {
    weth9: WETH9;
    factory: UniswapV3Factory;
    router: SwapRouter;
    nftDescriptorLibrary: NFTDescriptor;
    positionDescriptor: NonfungibleTokenPositionDescriptor;
    nftPositionManager: NonfungiblePositionManager;
  };
  let lendingContracts: {
    oracle: AaveOracle;
    poolAddressesProviderRegistry: PoolAddressesProviderRegistry;
  };
  let oracleContract: StaticOracle;
  let oracleWrapperContract: StaticOracleWrapper;
  let testTokens: {
    Token1: ERC20Test;
    Token2: ERC20Test;
    Token3: ERC20Test;
  };

  it("Prepare", async function () {
    const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

    // Deploy DEX contracts
    dexContracts = await deployDEX(hre);
    const dexFactoryAddress = await dexContracts.factory.getAddress();

    // Deploy and mint test tokens
    testTokens = await deployTestTokens({
      Token1: [getMintInfo(dexDeployer, 1e12), getMintInfo(dexLiquidityAdder, 1e12)],
      Token2: [getMintInfo(dexDeployer, 1e12), getMintInfo(dexLiquidityAdder, 1e12)],
      Token3: [getMintInfo(dexDeployer, 1e8), getMintInfo(dexLiquidityAdder, 1e8)],
    });

    // Deploy the oracle contract
    oracleContract = await deployOracle(dexFactoryAddress);
    const oracleAddress = await oracleContract.getAddress();

    // Deploy the oracle wrapper contract
    oracleWrapperContract = await deployOracleWrapper(
      oracleAddress,
      await testTokens.Token1.getAddress(),
      ethers.parseUnits("1", await testTokens.Token1.decimals()),
      1,
      AAVE_ORACLE_USD_DECIMALS, // price decimals
    );

    // Deploy the lending contracts
    lendingContracts = await deployLending(hre, oracleWrapperContract);
  });

  it("No pools yet", async function () {
    const token1Address = await testTokens.Token1.getAddress();
    const token2Address = await testTokens.Token2.getAddress();

    // No pools yet
    const res = await oracleContract.getAllPoolsForPair(token1Address, token2Address);
    chai.assert.isEmpty(res);

    await chai.expect(oracleWrapperContract.getAssetPrice(token2Address)).to.be.revertedWith("No existing pool for the pair");
  });

  it("Add pools to DEX", async function () {
    const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

    // Initialize DEX pools
    const res = await initDEXPool(hre, dexDeployer, dexLiquidityAdder, [
      {
        token0: await testTokens.Token1.getAddress(),
        token1: await testTokens.Token2.getAddress(),
        fee: FeeAmount.MEDIUM,
        initialPriceRatio: {
          amount0: 1,
          amount1: 2,
        },
        initialToken0Amount: 1e6, // Initial token0 amount for adding liquidity
      },
      {
        token0: await testTokens.Token2.getAddress(),
        token1: await testTokens.Token3.getAddress(),
        fee: FeeAmount.HIGH,
        initialPriceRatio: {
          amount0: 1,
          amount1: 50,
        },
        initialToken0Amount: 2e4, // Initial token0 amount for adding liquidity
      },
    ]);

    const expectedPoolInfos: {
      liquidity: bigint;
    }[] = [{ liquidity: 3129174178988097489815445n }, { liquidity: 163459499574653485675676n }];

    // Make sure the pools will not be empty, even if the expected pool infos are empty (due to human mistake)
    chai.assert.isNotEmpty(res.pools);
    chai.assert.lengthOf(res.pools, expectedPoolInfos.length);

    // Check the pools if matched with the expected pool infos
    for (let i = 0; i < res.pools.length; i++) {
      const pool = res.pools[i];
      const poolAddress = await pool.getAddress();
      chai.assert.isDefined(poolAddress);
      chai.assert.isNotEmpty(poolAddress);

      const liquidity = await pool.liquidity();
      chai.expect(liquidity).to.equal(expectedPoolInfos[i].liquidity);
    }
  });

  it("Can get the price now", async function () {
    const token1Address = await testTokens.Token1.getAddress();
    const token2Address = await testTokens.Token2.getAddress();

    // Has pools now
    const res = await oracleContract.getAllPoolsForPair(token1Address, token2Address);
    chai.assert.lengthOf(res, 1);

    // The price should be 0.5 after scaling
    await assertPrice(oracleWrapperContract, lendingContracts.oracle, token2Address, 50004091n, 0.50004091);
  });

  it("If quote token is the base token, the price should be 1 of price unit", async function () {
    const token1Address = await testTokens.Token1.getAddress();

    // The price should be 1 of price unit
    await assertPrice(oracleWrapperContract, lendingContracts.oracle, token1Address, BigInt(10 ** AAVE_ORACLE_USD_DECIMALS), 1);
  });

  it("The price should be the same after adding more liquidity to an existing pool", async function () {
    const { dexLiquidityAdder } = await hre.getNamedAccounts();

    const token1Address = await testTokens.Token1.getAddress();
    const token2Address = await testTokens.Token2.getAddress();

    // Add more liquidity to the pool
    await addLiquidityToDEXPool(
      hre,
      await dexContracts.factory.getAddress(),
      token1Address,
      token2Address,
      FeeAmount.MEDIUM, // the same as the existing pool's fee tier
      2e2,
      dexLiquidityAdder,
    );

    // Still have only one pool for the pair
    const res = await oracleContract.getAllPoolsForPair(token1Address, token2Address);
    chai.assert.lengthOf(res, 1);

    const poolAddress = await getPoolAddress(hre, await dexContracts.factory.getAddress(), token1Address, token2Address, FeeAmount.MEDIUM);
    chai.assert.isNotEmpty(poolAddress);
    chai.assert.isDefined(poolAddress);

    const pool = await getPoolFromAddress(hre, poolAddress);

    // The liquidity should be increased
    chai.expect(await pool.liquidity()).to.equal(3129800013823895109313408n);

    await preparePools(oracleContract, token1Address, token2Address);

    // The price should be the same
    await assertPrice(oracleWrapperContract, lendingContracts.oracle, token2Address, 50004091n, 0.50004091);
  });

  it("Perform a swap, the price should be changed", async function () {
    const { dexLiquidityAdder } = await hre.getNamedAccounts();

    const token1Address = await testTokens.Token1.getAddress();
    const token2Address = await testTokens.Token2.getAddress();
    const feeTier = FeeAmount.MEDIUM;
    const amountIn = ethers.parseUnits("150000", await testTokens.Token1.decimals());

    await swapExactInputSimple(hre, dexContracts.router, testTokens.Token1, testTokens.Token2, feeTier, dexLiquidityAdder, amountIn);

    await preparePools(oracleContract, token1Address, token2Address);

    // The price should changed
    await assertPrice(oracleWrapperContract, lendingContracts.oracle, token2Address, 56991281n, 0.56991281);
  });

  it("Perform a swap in a reverted direction, the price should be changed in a reverted direction", async function () {
    const { dexLiquidityAdder } = await hre.getNamedAccounts();

    const token1Address = await testTokens.Token1.getAddress();
    const token2Address = await testTokens.Token2.getAddress();
    const feeTier = FeeAmount.MEDIUM;
    const amountIn = ethers.parseUnits("350000", await testTokens.Token2.decimals());

    await swapExactInputSimple(hre, dexContracts.router, testTokens.Token2, testTokens.Token1, feeTier, dexLiquidityAdder, amountIn);

    await preparePools(oracleContract, token1Address, token2Address);

    // The price should changed in a reverted direction
    await assertPrice(oracleWrapperContract, lendingContracts.oracle, token2Address, 48482668n, 0.48482668);
  });
});

/**
 * Get the mint information
 *
 * @param receiverAddress - address to receive the minted tokens
 * @param amount - amount of tokens to mint
 * @returns - object with the amount and address to mint to
 */
function getMintInfo(receiverAddress: string, amount: number): { amount: number; toAddress: string } {
  return {
    amount: amount,
    toAddress: receiverAddress,
  };
}

/**
 * Assert the oracle price
 *
 * @param oracleWrapperContract - the oracle wrapper contract
 * @param aaveOracleContract - the Aave oracle contract
 * @param quoteTokenAddress - the quote token address
 * @param expectedRawPrice - the expected raw price (before scaling)
 * @param expectedPriceAfterScaling - the expected price after scaling
 */
async function assertPrice(
  oracleWrapperContract: StaticOracleWrapper,
  aaveOracleContract: AaveOracle,
  quoteTokenAddress: string,
  expectedRawPrice: bigint,
  expectedPriceAfterScaling: number,
): Promise<void> {
  const rawPrice = await oracleWrapperContract.getAssetPrice(quoteTokenAddress);
  chai.expect(rawPrice).to.equal(expectedRawPrice);

  // Get price decimals
  const priceDecimals = await oracleWrapperContract.PRICE_DECIMALS();

  // Make sure the price after scaling is close to 0.5
  chai.expect(Number(rawPrice) / 10 ** Number(priceDecimals)).to.closeTo(expectedPriceAfterScaling, 0.00001);

  const rawAaveOraclePrice = await aaveOracleContract.getAssetPrice(quoteTokenAddress);
  chai.expect(rawAaveOraclePrice).to.equal(expectedRawPrice);
}

/**
 * Prepare all available pools with time period
 *
 * Observations are only stored when the swap() function is called on the Pool or when a Position is modified,
 * so it can take some time to write the Observations after the observationCardinalityNext was increased.
 * If the number of Observations on the Pool is not sufficient, we need to call the prepareAllAvailablePoolsWithTimePeriod() function
 * and set it to the value we desire.
 * Reference: https://docs.uniswap.org/sdk/v3/guides/advanced/price-oracle#understanding-observations
 *
 * We put it here to avoid repeating the same explanation in the tests
 *
 * @param oracleContract - the oracle contract
 * @param token1Address - the token1 address
 * @param token2Address - the token2 address
 */
async function preparePools(oracleContract: StaticOracle, token1Address: string, token2Address: string): Promise<void> {
  await oracleContract.prepareAllAvailablePoolsWithTimePeriod(token1Address, token2Address, 1);
}
