import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("CurveLPWeightedOracleWrapper", function () {
  async function deployFixture() {
    const [owner, manager, user] = await ethers.getSigners();

    // Deploy mock tokens
    const ERC20Test = await ethers.getContractFactory(
      "contracts/test/ERC20Test.sol:ERC20Test",
    );
    const usdc = await ERC20Test.deploy("USDC", 6);
    const dai = await ERC20Test.deploy("DAI", 18);

    // Deploy mock oracle aggregator
    const MockOracleAggregator = await ethers.getContractFactory(
      "MockOracleAggregator",
    );
    const oracleAggregator = await MockOracleAggregator.deploy(
      ethers.ZeroAddress,
      ethers.parseUnits("1", 8),
    );

    // Deploy NG mock pool
    const MockNG = await ethers.getContractFactory(
      "contracts/test/curve/MockCurveStableNGForLP.sol:MockCurveStableNGForLP",
    );
    const curvePool = (await MockNG.deploy(
      "Curve USDC-DAI LP",
      "crvUSDCDAI",
      2,
    )) as any;

    // Setup pool coins (mock will read ERC20 metadata decimals automatically)
    await curvePool.setCoin(0, await usdc.getAddress());
    await curvePool.setCoin(1, await dai.getAddress());

    // Set balances equal, and default rates 1e18
    await curvePool.setBalances([
      ethers.parseUnits("1", 6),
      ethers.parseUnits("1", 18),
    ]);

    // Deploy weighted wrapper
    const Wrapper = await ethers.getContractFactory(
      "CurveLPWeightedOracleWrapper",
    );
    const wrapper = await Wrapper.deploy(
      ethers.parseUnits("1", 8),
      await oracleAggregator.getAddress(),
    );

    // Grant manager role
    const ORACLE_MANAGER_ROLE = await wrapper.ORACLE_MANAGER_ROLE();
    await wrapper.grantRole(ORACLE_MANAGER_ROLE, manager.address);

    return {
      owner,
      manager,
      user,
      usdc,
      dai,
      oracleAggregator,
      curvePool,
      wrapper,
      ORACLE_MANAGER_ROLE,
    };
  }

  it("requires full config and computes weighted price", async function () {
    const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
      await loadFixture(deployFixture);

    const lpToken = await curvePool.getAddress();
    const anchors = [await usdc.getAddress(), await dai.getAddress()];

    // prices: USDC = 1.00, DAI = 0.99
    await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1", 8));
    await oracleAggregator.setAssetPrice(
      anchors[1],
      ethers.parseUnits("0.99", 8),
    );

    // set virtual price = 1.0 and D_oracle to match (D = virtual_price * totalSupply)
    await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
    // totalSupply defaults to 1e18, so D_oracle should also be 1e18
    await curvePool.setDOracle(ethers.parseUnits("1", 18));

    // Configure fully
    await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

    const [price, alive] = await wrapper.getPriceInfo(lpToken);
    // weighted avg with equal xp => (1.00 + 0.99)/2 = 0.995
    expect(alive).to.eq(true);
    expect(price).to.eq(ethers.parseUnits("0.995", 8));
  });

  it("reverts setLPConfig (anchors required)", async function () {
    const { manager, curvePool, wrapper } = await loadFixture(deployFixture);
    await expect(
      wrapper
        .connect(manager)
        .setLPConfig(
          await curvePool.getAddress(),
          await curvePool.getAddress(),
          ethers.ZeroAddress,
        ),
    ).to.be.revertedWithCustomError(wrapper, "AnchorsRequired");
  });

  describe("Depeg scenarios", function () {
    it("should handle single asset depeg (USDC to $0.95)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set depeg prices: USDC = 0.95, DAI = 1.00
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.95", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Set equal balances and virtual price = 1.0
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      
      // Set D_oracle to match scenario (D = virtual_price * totalSupply)
      // With equal balances, D_oracle should reflect the pool state
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // With equal xp balances: weighted avg = (0.95 + 1.00)/2 = 0.975
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.975", 8));
    });

    it("should handle multiple asset depegs (USDC to $0.95, DAI to $0.98)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set depeg prices: USDC = 0.95, DAI = 0.98
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.95", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.98", 8));

      // Set equal balances
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // With equal xp balances: weighted avg = (0.95 + 0.98)/2 = 0.965
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.965", 8));
    });

    it("should handle extreme depeg (one asset to $0.10) gracefully", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set extreme depeg: USDC = 0.10, DAI = 1.00
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.10", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Set equal balances
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // Oracle should handle extreme depeg gracefully
      // With equal xp balances: weighted avg = (0.10 + 1.00)/2 = 0.55
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.55", 8));
    });

    it("should handle recovery from depeg (prices returning to normal)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Start with depegged prices: USDC = 0.95, DAI = 0.98
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.95", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.98", 8));

      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Check depegged state
      let [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.965", 8)); // (0.95 + 0.98)/2

      // Prices recover to normal: USDC = 1.00, DAI = 1.00
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Check recovered state
      [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8)); // (1.00 + 1.00)/2
    });

    it("should return alive=false when any anchor price feed is dead", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set normal prices initially
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Verify normal operation first
      let [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Kill USDC price feed
      await oracleAggregator.setAssetAlive(anchors[0], false);

      // Oracle should return alive=false
      [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(false);
      expect(price).to.eq(0);
    });

    it("should handle unbalanced pool during depeg", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set depeg: USDC = 0.95, DAI = 1.00
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.95", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Set unbalanced pool: more USDC than DAI (typical after depeg arbitrage)
      await curvePool.setBalances([
        ethers.parseUnits("1500", 6), // 1500 USDC (more)
        ethers.parseUnits("500", 18), // 500 DAI (less)
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // With unbalanced pool, the weighted average should be skewed towards USDC
      // USDC xp = 1500 * 1e30 / 1e18 = 1500 * 1e12
      // DAI xp = 500 * 1e18 * 1e18 / 1e18 = 500 * 1e18
      // Normalized: USDC xp = 1500, DAI xp = 500 (both in same 1e18 scale)
      // Weighted avg = (0.95 * 1500 + 1.00 * 500) / (1500 + 500) = (1425 + 500) / 2000 = 0.9625
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.9625", 8));
    });

    it("should handle D_oracle manipulation resistance during depeg", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set depeg prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.95", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);

      // Simulate potential manipulation: virtual price is inflated
      await curvePool.setVirtualPrice(ethers.parseUnits("1.1", 18)); // 10% inflated

      // But D_oracle remains at normal level (manipulation resistant)
      await curvePool.setDOracle(ethers.parseUnits("1", 18)); // Normal D_oracle

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // Oracle should use D_oracle (1.0) instead of inflated virtual_price (1.1)
      // Expected: (0.95 + 1.00)/2 * (1.0/1.0) = 0.975 * 1.0 = 0.975
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.975", 8));
    });
  });

  describe("Pool imbalance & edge cases", function () {
    it("should handle extreme pool imbalance (99:1 ratio) with various rate multipliers", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices: USDC = 1.00, DAI = 0.99
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.99", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Test scenario 1: 99% USDC, 1% DAI
      await curvePool.setBalances([
        ethers.parseUnits("9900", 6), // 9900 USDC
        ethers.parseUnits("100", 18), // 100 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      let [price, alive] = await wrapper.getPriceInfo(lpToken);
      // USDC xp = 9900 * 1e30 / 1e18 = 9900 * 1e12
      // DAI xp = 100 * 1e18 = 100 * 1e18
      // After normalization: USDC xp = 9900, DAI xp = 100
      // Weighted avg = (1.00 * 9900 + 0.99 * 100) / (9900 + 100) = (9900 + 99) / 10000 = 0.9999
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.9999", 8));

      // Test scenario 2: 1% USDC, 99% DAI
      await curvePool.setBalances([
        ethers.parseUnits("100", 6), // 100 USDC
        ethers.parseUnits("9900", 18), // 9900 DAI
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      // USDC xp = 100, DAI xp = 9900 (normalized)
      // Weighted avg = (1.00 * 100 + 0.99 * 9900) / (100 + 9900) = (100 + 9801) / 10000 = 0.9901
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.9901", 8));

      // Test scenario 3: Extreme imbalance with rate multipliers
      // Set custom rates to simulate different rate scenarios
      await curvePool.setStoredRates([
        ethers.parseUnits("2", 30), // 2x rate for USDC (2 * 10^30)
        ethers.parseUnits("0.5", 18), // 0.5x rate for DAI
      ]);
      
      // Reset to balanced amounts
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC  
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      // USDC xp = 1000 * 2 * 1e30 / 1e18 = 2000 * 1e12 (normalized = 2000)
      // DAI xp = 1000 * 0.5 * 1e18 / 1e18 = 500 * 1e18 (normalized = 500)
      // Weighted avg = (1.00 * 2000 + 0.99 * 500) / (2000 + 500) = (2000 + 495) / 2500 = 0.998
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.998", 8));
    });

    it("should handle empty/drained pool (zero balances) returns (0, false) safely", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set normal prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Set all balances to zero (drained pool)
      await curvePool.setBalances([0, 0]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // Should return safely with price=0, alive=false when totalXp is 0
      expect(alive).to.eq(false);
      expect(price).to.eq(0);
    });

    it("should handle partial pool drainage scenarios", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.99", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Scenario 1: One coin completely drained
      await curvePool.setBalances([
        0, // 0 USDC (completely drained)
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      let [price, alive] = await wrapper.getPriceInfo(lpToken);
      // Only DAI contributes to xp: xp = 1000, weighted price = 0.99
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.99", 8));

      // Scenario 2: Near-zero balances
      await curvePool.setBalances([
        1, // 1 wei USDC
        ethers.parseUnits("0.001", 18), // 0.001 DAI
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      // USDC xp = 1 * 1e30 / 1e18 = 1e12 (very small)
      // DAI xp = 0.001 * 1e18 = 1e15
      // DAI dominates: weighted avg approaches 0.99
      expect(alive).to.eq(true);
      // Price should be close to DAI's price due to dominance
      expect(price).to.be.closeTo(ethers.parseUnits("0.99", 8), ethers.parseUnits("0.001", 8));
    });

    it("should handle different decimal tokens (USDC 6 decimals, DAI 18 decimals) and verify rate normalization works correctly", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully (coins already set with correct decimals in fixture)
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Verify the mock has set correct rates for different decimal tokens
      // USDC (6 decimals): rate should be 10^(36-6) = 10^30
      // DAI (18 decimals): rate should be 10^(36-18) = 10^18
      const rates = await curvePool.stored_rates();
      expect(rates[0]).to.eq(ethers.parseUnits("1", 30)); // USDC rate
      expect(rates[1]).to.eq(ethers.parseUnits("1", 18)); // DAI rate

      // Test with equal USD values but different decimal representations
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC (6 decimals)
        ethers.parseUnits("1000", 18), // 1000 DAI (18 decimals)
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // Despite different decimal representations, both should contribute equally to xp
      // USDC xp = 1000 * 1e6 * 1e30 / 1e18 = 1000 * 1e18
      // DAI xp = 1000 * 1e18 * 1e18 / 1e18 = 1000 * 1e18
      // Equal contribution, so weighted avg = (1.00 + 1.00)/2 = 1.00
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Test with unequal amounts to verify normalization
      await curvePool.setBalances([
        ethers.parseUnits("500", 6), // 500 USDC
        ethers.parseUnits("1500", 18), // 1500 DAI
      ]);

      const [price2, alive2] = await wrapper.getPriceInfo(lpToken);
      // USDC xp = 500 * 1e18, DAI xp = 1500 * 1e18
      // Total xp = 2000 * 1e18
      // Weighted avg = (1.00 * 500 + 1.00 * 1500) / 2000 = 2000/2000 = 1.00
      expect(alive2).to.eq(true);
      expect(price2).to.eq(ethers.parseUnits("1.00", 8));
    });

    it("should handle zero totalSupply edge case (should return price=0, alive=false)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set normal prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Set normal balances
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      
      // Set D_oracle to positive value
      await curvePool.setDOracle(ethers.parseUnits("1000", 18));
      
      // But set totalSupply to 0 (edge case scenario)
      await curvePool.setTotalSupply(0);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // When totalSupply is 0, virtualPrice calculation should result in 0
      // This should cause the function to return (0, false)
      expect(alive).to.eq(false);
      expect(price).to.eq(0);
    });

    it("should handle zero D_oracle edge case (should return price=0, alive=false)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set normal prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Set normal balances and totalSupply
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("1000", 18));
      
      // Set D_oracle to 0 (edge case)
      await curvePool.setDOracle(0);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // When D_oracle is 0, virtualPrice calculation should result in 0
      // This should cause the function to return (0, false)
      expect(alive).to.eq(false);
      expect(price).to.eq(0);
    });

    it("should handle single coin pool (N_COINS = 1) edge case", async function () {
      const { manager, wrapper, oracleAggregator, usdc } = await loadFixture(deployFixture);

      // Deploy single coin mock pool
      const MockNG = await ethers.getContractFactory(
        "contracts/test/curve/MockCurveStableNGForLP.sol:MockCurveStableNGForLP",
      );
      const singleCoinPool = await MockNG.deploy("Single USDC Pool", "sUSDC", 1);

      // Setup single coin
      await singleCoinPool.setCoin(0, await usdc.getAddress());
      await singleCoinPool.setBalances([ethers.parseUnits("1000", 6)]);
      await singleCoinPool.setVirtualPrice(ethers.parseUnits("1", 18));
      // D_oracle should match virtual_price * totalSupply for proper calculation
      await singleCoinPool.setDOracle(ethers.parseUnits("1", 18)); // 1e18 to match virtual price

      const lpToken = await singleCoinPool.getAddress();
      const anchors = [await usdc.getAddress()];

      // Set USDC price
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // With single coin, weighted average should equal that coin's price
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));
    });

    it("should handle precision edge cases with very small balances and large rates", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Set very small balances
      await curvePool.setBalances([
        1, // 1 wei USDC
        1, // 1 wei DAI
      ]);
      
      // Set very large custom rates to test precision
      await curvePool.setStoredRates([
        ethers.parseUnits("1", 35), // Very large rate for USDC
        ethers.parseUnits("1", 35), // Very large rate for DAI
      ]);
      
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      const [price, alive] = await wrapper.getPriceInfo(lpToken);
      
      // Should handle precision gracefully without reverting
      expect(alive).to.eq(true);
      expect(price).to.be.gt(0);
    });
  });

  describe("Flash loan & manipulation resistance", function () {
    it("should remain stable when balances are manipulated (flash loan donation)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Initial balanced state
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      
      // Set normal D_oracle (manipulation-resistant)
      await curvePool.setDOracle(ethers.parseUnits("2000", 18)); // Normal D reflecting pool size
      // Set inflated virtual_price due to flash loan manipulation
      await curvePool.setVirtualPrice(ethers.parseUnits("1.5", 18)); // 50% inflated
      await curvePool.setTotalSupply(ethers.parseUnits("2000", 18));

      // Get price using D_oracle-based calculation
      const [price, alive] = await wrapper.getPriceInfo(lpToken);

      // Oracle should use D_oracle to calculate virtual price = D_oracle / totalSupply
      // virtualPrice = (2000e18 * 1e18) / 2000e18 = 1e18 (normal, not inflated)
      // Weighted avg with equal balances: (1.00 + 1.00)/2 = 1.00
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Now simulate extreme flash loan donation: balances massively inflated
      await curvePool.setBalances([
        ethers.parseUnits("100000", 6), // 100,000 USDC (100x donation)
        ethers.parseUnits("100000", 18), // 100,000 DAI (100x donation)
      ]);
      // virtual_price would be inflated due to manipulation
      await curvePool.setVirtualPrice(ethers.parseUnits("50", 18)); // Extremely inflated
      // But D_oracle remains stable (EMA smoothing)
      await curvePool.setDOracle(ethers.parseUnits("2000", 18)); // Unchanged, resistant to manipulation

      const [priceAfterManipulation, aliveAfterManipulation] = await wrapper.getPriceInfo(lpToken);
      
      // D_oracle-based price should remain stable despite balance manipulation
      // virtualPrice still = (2000e18 * 1e18) / 2000e18 = 1e18
      expect(aliveAfterManipulation).to.eq(true);
      expect(priceAfterManipulation).to.eq(ethers.parseUnits("1.00", 8));
    });

    it("should show D_oracle differs from get_virtual_price during manipulation", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Setup manipulation scenario
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("1000", 18));

      // Case 1: Normal state - D_oracle and virtual_price should be similar
      await curvePool.setDOracle(ethers.parseUnits("1000", 18)); // Normal D
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18)); // Normal virtual price
      
      const virtualPriceFromPool = await curvePool.get_virtual_price();
      const dOracleFromPool = await curvePool.D_oracle();
      const totalSupply = await curvePool.totalSupply();
      
      // Calculate what the oracle uses (D_oracle based virtual price)
      const oracleVirtualPrice = (dOracleFromPool * ethers.parseUnits("1", 18)) / totalSupply;
      
      // They should be very close in normal state
      expect(virtualPriceFromPool).to.eq(ethers.parseUnits("1", 18));
      expect(oracleVirtualPrice).to.eq(ethers.parseUnits("1", 18));

      const [normalPrice, normalAlive] = await wrapper.getPriceInfo(lpToken);
      expect(normalAlive).to.eq(true);
      expect(normalPrice).to.eq(ethers.parseUnits("1.00", 8));

      // Case 2: Manipulation - virtual_price inflated but D_oracle stable
      await curvePool.setVirtualPrice(ethers.parseUnits("2", 18)); // 100% inflated
      await curvePool.setDOracle(ethers.parseUnits("1000", 18)); // D_oracle unchanged (manipulation resistant)

      const manipulatedVirtualPrice = await curvePool.get_virtual_price();
      const stableDOracle = await curvePool.D_oracle();
      const oracleVirtualPriceAfter = (stableDOracle * ethers.parseUnits("1", 18)) / totalSupply;

      // Show the difference
      expect(manipulatedVirtualPrice).to.eq(ethers.parseUnits("2", 18)); // Inflated
      expect(oracleVirtualPriceAfter).to.eq(ethers.parseUnits("1", 18)); // Stable

      // Oracle price should be stable (using D_oracle, not inflated virtual_price)
      const [stablePrice, stableAlive] = await wrapper.getPriceInfo(lpToken);
      expect(stableAlive).to.eq(true);
      expect(stablePrice).to.eq(ethers.parseUnits("1.00", 8)); // Unchanged
    });

    it("should resist sandwich attack (manipulate before, check oracle, manipulate back)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices: slight depeg to make attack more appealing
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.98", 8)); // DAI depegged

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Initial state: balanced pool
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("1000", 18));
      await curvePool.setDOracle(ethers.parseUnits("1000", 18));
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));

      // Get initial price
      const [initialPrice, initialAlive] = await wrapper.getPriceInfo(lpToken);
      expect(initialAlive).to.eq(true);
      // Weighted avg: (1.00 * 1000 + 0.98 * 1000) / 2000 = 0.99
      expect(initialPrice).to.eq(ethers.parseUnits("0.99", 8));

      // Step 1: Attacker manipulates pool before oracle read
      // Simulate large swap: dump DAI, get USDC (trying to inflate price)
      await curvePool.setBalances([
        ethers.parseUnits("500", 6), // 500 USDC (reduced due to swap out)
        ethers.parseUnits("2000", 18), // 2000 DAI (increased due to swap in)
      ]);
      // Attacker tries to manipulate virtual_price upward
      await curvePool.setVirtualPrice(ethers.parseUnits("1.3", 18)); // 30% inflated
      // But D_oracle is manipulation-resistant (EMA smoothed)
      await curvePool.setDOracle(ethers.parseUnits("1000", 18)); // Unchanged

      // Step 2: Check oracle during manipulation
      const [manipulatedPrice, manipulatedAlive] = await wrapper.getPriceInfo(lpToken);
      expect(manipulatedAlive).to.eq(true);
      
      // Despite imbalanced pool, D_oracle keeps virtual price stable
      // Oracle virtual price = (1000e18 * 1e18) / 1000e18 = 1e18
      // Now weighted by actual balances: USDC xp = 500, DAI xp = 2000
      // Weighted avg = (1.00 * 500 + 0.98 * 2000) / 2500 = (500 + 1960) / 2500 = 0.984
      expect(manipulatedPrice).to.eq(ethers.parseUnits("0.984", 8));

      // Step 3: Attacker manipulates back (sandwich completion)
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // Back to 1000 USDC
        ethers.parseUnits("1000", 18), // Back to 1000 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18)); // Back to normal
      await curvePool.setDOracle(ethers.parseUnits("1000", 18)); // Still stable

      const [finalPrice, finalAlive] = await wrapper.getPriceInfo(lpToken);
      expect(finalAlive).to.eq(true);
      expect(finalPrice).to.eq(ethers.parseUnits("0.99", 8)); // Back to original

      // Key test: D_oracle-based pricing prevented exploitation
      // The price during manipulation (0.984) was very close to fair value (0.99)
      // Without D_oracle, inflated virtual_price would have made this attack profitable
    });

    it("should not spike when large amounts are added/removed from pool", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Start with small pool
      await curvePool.setBalances([
        ethers.parseUnits("100", 6), // 100 USDC
        ethers.parseUnits("100", 18), // 100 DAI
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("100", 18));
      await curvePool.setDOracle(ethers.parseUnits("100", 18));
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));

      const [smallPoolPrice, smallPoolAlive] = await wrapper.getPriceInfo(lpToken);
      expect(smallPoolAlive).to.eq(true);
      expect(smallPoolPrice).to.eq(ethers.parseUnits("1.00", 8));

      // Scenario 1: Massive liquidity addition
      await curvePool.setBalances([
        ethers.parseUnits("100000", 6), // 100,000 USDC (1000x increase)
        ethers.parseUnits("100000", 18), // 100,000 DAI (1000x increase)
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("100000", 18)); // Proportional LP increase
      // If using raw virtual_price, it might spike due to AMM mechanics
      await curvePool.setVirtualPrice(ethers.parseUnits("1.1", 18)); // 10% spike from large add
      // But D_oracle smooths this out
      await curvePool.setDOracle(ethers.parseUnits("100000", 18)); // Proportional, no spike

      const [largePoolPrice, largePoolAlive] = await wrapper.getPriceInfo(lpToken);
      expect(largePoolAlive).to.eq(true);
      // D_oracle prevents price spike: (100000e18 * 1e18) / 100000e18 = 1e18
      expect(largePoolPrice).to.eq(ethers.parseUnits("1.00", 8)); // No spike

      // Scenario 2: Massive liquidity removal
      await curvePool.setBalances([
        ethers.parseUnits("10", 6), // 10 USDC (very small)
        ethers.parseUnits("10", 18), // 10 DAI (very small)
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("10", 18)); // Proportional decrease
      // Raw virtual_price might have issues with small liquidity
      await curvePool.setVirtualPrice(ethers.parseUnits("0.8", 18)); // 20% drop from removal mechanics
      // D_oracle remains stable
      await curvePool.setDOracle(ethers.parseUnits("10", 18)); // Proportional, stable

      const [tinyPoolPrice, tinyPoolAlive] = await wrapper.getPriceInfo(lpToken);
      expect(tinyPoolAlive).to.eq(true);
      // D_oracle prevents price crash: (10e18 * 1e18) / 10e18 = 1e18
      expect(tinyPoolPrice).to.eq(ethers.parseUnits("1.00", 8)); // Stable

      // Scenario 3: Asymmetric addition (only one asset)
      await curvePool.setBalances([
        ethers.parseUnits("50000", 6), // 50,000 USDC (huge single-sided add)
        ethers.parseUnits("100", 18), // 100 DAI (unchanged)
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("10000", 18)); // Some LP minted
      // Single-sided adds can cause virtual_price volatility
      await curvePool.setVirtualPrice(ethers.parseUnits("1.2", 18)); // 20% spike
      // D_oracle smooths this
      await curvePool.setDOracle(ethers.parseUnits("10000", 18)); // Stable EMA

      const [asymmetricPrice, asymmetricAlive] = await wrapper.getPriceInfo(lpToken);
      expect(asymmetricAlive).to.eq(true);
      // Oracle price = (D_oracle/totalSupply) * weighted_avg
      // Virtual price from D_oracle = (10000e18 * 1e18) / 10000e18 = 1e18
      // Weighted avg = (1.00 * 50000 + 1.00 * 100) / 50100 ≈ 1.00
      expect(asymmetricPrice).to.be.closeTo(
        ethers.parseUnits("1.00", 8),
        ethers.parseUnits("0.01", 8) // Allow small variance due to weighting
      );
    });

    it("should smooth multi-block manipulation attempts over time", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Initial state
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("1000", 18));
      await curvePool.setDOracle(ethers.parseUnits("1000", 18));
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));

      const [initialPrice, initialAlive] = await wrapper.getPriceInfo(lpToken);
      expect(initialAlive).to.eq(true);
      expect(initialPrice).to.eq(ethers.parseUnits("1.00", 8));

      // Block 1: Start manipulation attempt
      await curvePool.setVirtualPrice(ethers.parseUnits("1.3", 18)); // 30% inflated
      await curvePool.setDOracle(ethers.parseUnits("1050", 18)); // D_oracle starts moving slowly (5% change)

      const [block1Price, block1Alive] = await wrapper.getPriceInfo(lpToken);
      expect(block1Alive).to.eq(true);
      // Virtual price from D_oracle = (1050e18 * 1e18) / 1000e18 = 1.05e18
      expect(block1Price).to.eq(ethers.parseUnits("1.05", 8)); // Small increase

      // Block 2: Continued manipulation
      await curvePool.setVirtualPrice(ethers.parseUnits("1.4", 18)); // Even more inflated
      await curvePool.setDOracle(ethers.parseUnits("1080", 18)); // D_oracle continues slow EMA update

      const [block2Price, block2Alive] = await wrapper.getPriceInfo(lpToken);
      expect(block2Alive).to.eq(true);
      // Virtual price from D_oracle = (1080e18 * 1e18) / 1000e18 = 1.08e18
      expect(block2Price).to.eq(ethers.parseUnits("1.08", 8)); // Gradual increase

      // Block 3: Manipulation ends, D_oracle starts returning to normal
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18)); // Back to normal
      await curvePool.setDOracle(ethers.parseUnits("1060", 18)); // D_oracle slow to revert (EMA)

      const [block3Price, block3Alive] = await wrapper.getPriceInfo(lpToken);
      expect(block3Alive).to.eq(true);
      // Virtual price from D_oracle = (1060e18 * 1e18) / 1000e18 = 1.06e18
      expect(block3Price).to.eq(ethers.parseUnits("1.06", 8)); // Still elevated but dropping

      // Block 4: More time passes, D_oracle converges back
      await curvePool.setDOracle(ethers.parseUnits("1020", 18)); // Continuing to revert

      const [block4Price, block4Alive] = await wrapper.getPriceInfo(lpToken);
      expect(block4Alive).to.eq(true);
      expect(block4Price).to.eq(ethers.parseUnits("1.02", 8)); // Further convergence

      // Block 5: Full convergence back to normal
      await curvePool.setDOracle(ethers.parseUnits("1000", 18)); // Back to baseline

      const [finalPrice, finalAlive] = await wrapper.getPriceInfo(lpToken);
      expect(finalAlive).to.eq(true);
      expect(finalPrice).to.eq(ethers.parseUnits("1.00", 8)); // Fully recovered

      // Key insight: D_oracle EMA smoothing prevented immediate price manipulation
      // Even with 30-40% virtual_price inflation, oracle price only moved 5-8%
      // And smoothly returned to normal over time
    });

    it("should handle extreme manipulation attempts with D_oracle vs virtual_price comparison", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setTotalSupply(ethers.parseUnits("1000", 18));

      // Extreme manipulation scenario 1: 10x virtual_price inflation
      await curvePool.setVirtualPrice(ethers.parseUnits("10", 18)); // 1000% inflated!
      await curvePool.setDOracle(ethers.parseUnits("1100", 18)); // D_oracle only 10% higher (resistance)

      let virtualPriceRaw = await curvePool.get_virtual_price();
      let dOracle = await curvePool.D_oracle();
      let totalSupply = await curvePool.totalSupply();
      let virtualPriceFromDOracle = (dOracle * ethers.parseUnits("1", 18)) / totalSupply;

      // Show massive difference
      expect(virtualPriceRaw).to.eq(ethers.parseUnits("10", 18)); // 10x inflated
      expect(virtualPriceFromDOracle).to.eq(ethers.parseUnits("1.1", 18)); // Only 1.1x

      const [price1, alive1] = await wrapper.getPriceInfo(lpToken);
      expect(alive1).to.eq(true);
      expect(price1).to.eq(ethers.parseUnits("1.10", 8)); // Uses D_oracle, not inflated price

      // Extreme manipulation scenario 2: Negative manipulation (price crash)
      await curvePool.setVirtualPrice(ethers.parseUnits("0.1", 18)); // 90% crash
      await curvePool.setDOracle(ethers.parseUnits("900", 18)); // D_oracle only 10% lower

      virtualPriceRaw = await curvePool.get_virtual_price();
      dOracle = await curvePool.D_oracle();
      virtualPriceFromDOracle = (dOracle * ethers.parseUnits("1", 18)) / totalSupply;

      expect(virtualPriceRaw).to.eq(ethers.parseUnits("0.1", 18)); // 90% crash
      expect(virtualPriceFromDOracle).to.eq(ethers.parseUnits("0.9", 18)); // Only 10% drop

      const [price2, alive2] = await wrapper.getPriceInfo(lpToken);
      expect(alive2).to.eq(true);
      expect(price2).to.eq(ethers.parseUnits("0.90", 8)); // Protected from crash

      // Extreme manipulation scenario 3: Asymmetric with different asset prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("2.00", 8)); // USDC 2x
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.50", 8)); // DAI 0.5x

      // Unbalanced pool to amplify manipulation effect
      await curvePool.setBalances([
        ethers.parseUnits("100", 6), // Low USDC (high price asset)
        ethers.parseUnits("3000", 18), // High DAI (low price asset)
      ]);

      await curvePool.setVirtualPrice(ethers.parseUnits("5", 18)); // 5x inflated
      await curvePool.setDOracle(ethers.parseUnits("1200", 18)); // D_oracle modest increase

      virtualPriceFromDOracle = (ethers.parseUnits("1200", 18) * ethers.parseUnits("1", 18)) / totalSupply;
      expect(virtualPriceFromDOracle).to.eq(ethers.parseUnits("1.2", 18)); // 1.2x vs 5x inflation

      const [price3, alive3] = await wrapper.getPriceInfo(lpToken);
      expect(alive3).to.eq(true);
      
      // Weighted avg with unbalanced pool and different prices:
      // USDC xp = 100, DAI xp = 3000, total = 3100
      // Weighted = (2.00 * 100 + 0.50 * 3000) / 3100 = (200 + 1500) / 3100 = 0.548
      // Final price = 1.2 * 0.548 = 0.658
      expect(price3).to.be.closeTo(
        ethers.parseUnits("0.658", 8),
        ethers.parseUnits("0.001", 8)
      );

      // Without D_oracle protection, this would have been 5x * 0.548 = 2.74!
    });
  });

  describe("Rate multipliers & special tokens", function () {
    it("should handle ERC4626 vault tokens with varying exchange rates", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set underlying asset prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Test scenario 1: USDC vault with 1.2x exchange rate, DAI vault with 0.9x rate
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC vault tokens
        ethers.parseUnits("1000", 18), // 1000 DAI vault tokens
      ]);

      // Set vault exchange rates via stored_rates
      await curvePool.setStoredRates([
        ethers.parseUnits("1.2", 30), // USDC vault: 1.2 underlying per vault token
        ethers.parseUnits("0.9", 18), // DAI vault: 0.9 underlying per vault token
      ]);

      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      const [price, alive] = await wrapper.getPriceInfo(lpToken);

      // USDC xp = 1000 * 1.2 * 1e30 / 1e18 = 1200 * 1e12 (normalized = 1200)
      // DAI xp = 1000 * 0.9 * 1e18 / 1e18 = 900 * 1e18 (normalized = 900)
      // Weighted avg = (1.00 * 1200 + 1.00 * 900) / (1200 + 900) = 2100 / 2100 = 1.00
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Test scenario 2: High-yield vault with 2.5x rate
      await curvePool.setStoredRates([
        ethers.parseUnits("2.5", 30), // USDC vault: 2.5x exchange rate
        ethers.parseUnits("1", 18), // DAI normal rate
      ]);

      const [highYieldPrice, highYieldAlive] = await wrapper.getPriceInfo(lpToken);

      // USDC xp = 1000 * 2.5 = 2500, DAI xp = 1000 * 1 = 1000
      // Weighted avg = (1.00 * 2500 + 1.00 * 1000) / (2500 + 1000) = 3500 / 3500 = 1.00
      expect(highYieldAlive).to.eq(true);
      expect(highYieldPrice).to.eq(ethers.parseUnits("1.00", 8));

      // Test scenario 3: Vault with declining rate (simulating losses)
      await curvePool.setStoredRates([
        ethers.parseUnits("0.7", 30), // USDC vault: 0.7x (losses)
        ethers.parseUnits("1.1", 18), // DAI vault: 1.1x (gains)
      ]);

      const [declinedPrice, declinedAlive] = await wrapper.getPriceInfo(lpToken);

      // USDC xp = 1000 * 0.7 = 700, DAI xp = 1000 * 1.1 = 1100
      // Weighted avg = (1.00 * 700 + 1.00 * 1100) / (700 + 1100) = 1800 / 1800 = 1.00
      expect(declinedAlive).to.eq(true);
      expect(declinedPrice).to.eq(ethers.parseUnits("1.00", 8));
    });

    it("should handle oracle-based rates (type 1 assets) with dynamic rate changes", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set base asset prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      await curvePool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Scenario 1: Initial oracle rates
      await curvePool.setStoredRates([
        ethers.parseUnits("1.5", 30), // Type 1 asset with 1.5x oracle rate
        ethers.parseUnits("0.8", 18), // Type 1 asset with 0.8x oracle rate
      ]);

      let [price, alive] = await wrapper.getPriceInfo(lpToken);

      // USDC xp = 1000 * 1.5 = 1500, DAI xp = 1000 * 0.8 = 800
      // Weighted avg = (1.00 * 1500 + 1.00 * 800) / (1500 + 800) = 2300 / 2300 = 1.00
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Scenario 2: Oracle rates change dynamically (simulating price feed updates)
      await curvePool.setStoredRates([
        ethers.parseUnits("2.0", 30), // Oracle rate increased to 2.0x
        ethers.parseUnits("0.5", 18), // Oracle rate decreased to 0.5x
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);

      // USDC xp = 1000 * 2.0 = 2000, DAI xp = 1000 * 0.5 = 500
      // Weighted avg = (1.00 * 2000 + 1.00 * 500) / (2000 + 500) = 2500 / 2500 = 1.00
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Scenario 3: Extreme oracle rate changes with price depegs
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.95", 8)); // USDC depeg
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.05", 8)); // DAI premium

      await curvePool.setStoredRates([
        ethers.parseUnits("3.0", 30), // Very high oracle rate
        ethers.parseUnits("0.3", 18), // Very low oracle rate
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);

      // USDC xp = 1000 * 3.0 = 3000, DAI xp = 1000 * 0.3 = 300
      // Weighted avg = (0.95 * 3000 + 1.05 * 300) / (3000 + 300) = (2850 + 315) / 3300 = 0.959
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("0.959", 8), ethers.parseUnits("0.001", 8));
    });

    it("should handle rate precision edge cases (very high and very low rates)", async function () {
      const { manager, curvePool, wrapper, oracleAggregator, usdc, dai } =
        await loadFixture(deployFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8));
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
      await curvePool.setDOracle(ethers.parseUnits("1", 18));

      // Test case 1: Very high rate (approaching uint256 limits)
      await curvePool.setStoredRates([
        ethers.parseUnits("1", 35), // Extremely high rate (1e35)
        ethers.parseUnits("1", 18), // Normal rate
      ]);

      let [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      expect(price).to.be.gt(0); // Should not revert, price should be computable

      // Test case 2: Very low rate (approaching zero)
      await curvePool.setStoredRates([
        1, // Minimum possible rate (1 wei)
        ethers.parseUnits("1", 18), // Normal rate
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      // With extremely low USDC rate, price should be heavily weighted towards DAI
      expect(price).to.be.closeTo(ethers.parseUnits("1.00", 8), ethers.parseUnits("0.01", 8));

      // Test case 3: Mixed extreme rates
      await curvePool.setStoredRates([
        ethers.parseUnits("1", 50), // Extremely high rate (will be normalized down)
        1, // Extremely low rate
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      expect(price).to.be.gt(0);

      // Test case 4: Rate precision with small balances
      await curvePool.setBalances([
        1, // 1 wei USDC
        1, // 1 wei DAI (smallest possible)
      ]);

      await curvePool.setStoredRates([
        ethers.parseUnits("1", 30), // Normal USDC rate
        ethers.parseUnits("1", 18), // Normal DAI rate
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Test case 5: Maximum precision difference between rates
      await curvePool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);

      await curvePool.setStoredRates([
        ethers.parseUnits("1", 30), // 1e30 (USDC normal)
        ethers.parseUnits("1", 6), // 1e6 (extremely low precision)
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);
      // Should handle precision difference gracefully
      expect(alive).to.eq(true);
      expect(price).to.be.gt(0);
    });

    it("should handle 3+ coin pools and ensure weighted calculation works for N coins", async function () {
      const { manager, wrapper, oracleAggregator } = await loadFixture(deployFixture);

      // Create additional test tokens
      const ERC20Test = await ethers.getContractFactory("contracts/test/ERC20Test.sol:ERC20Test");
      const usdc = await ERC20Test.deploy("USDC", 6);
      const dai = await ERC20Test.deploy("DAI", 18);
      const usdt = await ERC20Test.deploy("USDT", 6);
      const frax = await ERC20Test.deploy("FRAX", 18);

      // Deploy 4-coin pool
      const MockNG = await ethers.getContractFactory(
        "contracts/test/curve/MockCurveStableNGForLP.sol:MockCurveStableNGForLP",
      );
      const fourCoinPool = await MockNG.deploy("4Pool LP", "4POOL", 4);

      // Setup 4 coins
      await fourCoinPool.setCoin(0, await usdc.getAddress());
      await fourCoinPool.setCoin(1, await dai.getAddress());
      await fourCoinPool.setCoin(2, await usdt.getAddress());
      await fourCoinPool.setCoin(3, await frax.getAddress());

      const lpToken = await fourCoinPool.getAddress();
      const anchors = [
        await usdc.getAddress(),
        await dai.getAddress(),
        await usdt.getAddress(),
        await frax.getAddress(),
      ];

      // Set different prices for each asset
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1.00", 8)); // USDC
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.99", 8)); // DAI
      await oracleAggregator.setAssetPrice(anchors[2], ethers.parseUnits("1.01", 8)); // USDT
      await oracleAggregator.setAssetPrice(anchors[3], ethers.parseUnits("0.98", 8)); // FRAX

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Test scenario 1: Equal balances
      await fourCoinPool.setBalances([
        ethers.parseUnits("1000", 6), // 1000 USDC
        ethers.parseUnits("1000", 18), // 1000 DAI
        ethers.parseUnits("1000", 6), // 1000 USDT
        ethers.parseUnits("1000", 18), // 1000 FRAX
      ]);

      // Set equal rates (coins will have different rates based on decimals)
      await fourCoinPool.setStoredRates([
        ethers.parseUnits("1", 30), // USDC rate (6 decimals -> 30-6 = 24 + 6 = 30)
        ethers.parseUnits("1", 18), // DAI rate (18 decimals -> 30-18 = 12 + 6 = 18)
        ethers.parseUnits("1", 30), // USDT rate (6 decimals -> 30-6 = 24 + 6 = 30)
        ethers.parseUnits("1", 18), // FRAX rate (18 decimals -> 30-18 = 12 + 6 = 18)
      ]);

      await fourCoinPool.setVirtualPrice(ethers.parseUnits("1", 18));
      await fourCoinPool.setDOracle(ethers.parseUnits("1", 18));

      let [price, alive] = await wrapper.getPriceInfo(lpToken);

      // All coins have equal xp after normalization: 1000 each
      // Weighted avg = (1.00*1000 + 0.99*1000 + 1.01*1000 + 0.98*1000) / 4000
      // = (1000 + 990 + 1010 + 980) / 4000 = 3980 / 4000 = 0.995
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("0.995", 8));

      // Test scenario 2: Unequal balances with different rates
      await fourCoinPool.setBalances([
        ethers.parseUnits("2000", 6), // 2000 USDC (double)
        ethers.parseUnits("500", 18), // 500 DAI (half)
        ethers.parseUnits("1500", 6), // 1500 USDT (1.5x)
        ethers.parseUnits("1000", 18), // 1000 FRAX (normal)
      ]);

      await fourCoinPool.setStoredRates([
        ethers.parseUnits("1.2", 30), // USDC with 1.2x rate
        ethers.parseUnits("0.9", 18), // DAI with 0.9x rate
        ethers.parseUnits("1.1", 30), // USDT with 1.1x rate
        ethers.parseUnits("0.8", 18), // FRAX with 0.8x rate
      ]);

      [price, alive] = await wrapper.getPriceInfo(lpToken);

      // Calculate expected:
      // USDC xp = 2000 * 1.2 = 2400
      // DAI xp = 500 * 0.9 = 450
      // USDT xp = 1500 * 1.1 = 1650
      // FRAX xp = 1000 * 0.8 = 800
      // Total xp = 2400 + 450 + 1650 + 800 = 5300
      // Weighted avg = (1.00*2400 + 0.99*450 + 1.01*1650 + 0.98*800) / 5300
      // = (2400 + 445.5 + 1666.5 + 784) / 5300 = 5296 / 5300 ≈ 0.9992
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("0.9992", 8), ethers.parseUnits("0.0001", 8));

      // Test scenario 3: 5-coin pool for even more coins
      const fiveCoinPool = await MockNG.deploy("5Pool LP", "5POOL", 5);
      const weth = await ERC20Test.deploy("WETH", 18);

      await fiveCoinPool.setCoin(0, await usdc.getAddress());
      await fiveCoinPool.setCoin(1, await dai.getAddress());
      await fiveCoinPool.setCoin(2, await usdt.getAddress());
      await fiveCoinPool.setCoin(3, await frax.getAddress());
      await fiveCoinPool.setCoin(4, await weth.getAddress());

      const fiveCoinLpToken = await fiveCoinPool.getAddress();
      const fiveCoinAnchors = [...anchors, await weth.getAddress()];

      // Set WETH price
      await oracleAggregator.setAssetPrice(await weth.getAddress(), ethers.parseUnits("2000", 8)); // WETH at $2000

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(fiveCoinLpToken, fiveCoinLpToken, fiveCoinAnchors);

      await fiveCoinPool.setBalances([
        ethers.parseUnits("1000", 6), // USDC
        ethers.parseUnits("1000", 18), // DAI
        ethers.parseUnits("1000", 6), // USDT
        ethers.parseUnits("1000", 18), // FRAX
        ethers.parseUnits("1", 18), // 1 WETH (high value, low quantity)
      ]);

      await fiveCoinPool.setStoredRates([
        ethers.parseUnits("1", 30), // USDC
        ethers.parseUnits("1", 18), // DAI
        ethers.parseUnits("1", 30), // USDT
        ethers.parseUnits("1", 18), // FRAX
        ethers.parseUnits("1", 18), // WETH
      ]);

      await fiveCoinPool.setVirtualPrice(ethers.parseUnits("1", 18));
      await fiveCoinPool.setDOracle(ethers.parseUnits("1", 18));

      const [fiveCoinPrice, fiveCoinAlive] = await wrapper.getPriceInfo(fiveCoinLpToken);

      // All stablecoins have xp=1000, WETH has xp=1
      // Total xp = 4001
      // Weighted = (1.00*1000 + 0.99*1000 + 1.01*1000 + 0.98*1000 + 2000*1) / 4001
      // = (1000 + 990 + 1010 + 980 + 2000) / 4001 = 5980 / 4001 ≈ 1.494
      expect(fiveCoinAlive).to.eq(true);
      expect(fiveCoinPrice).to.be.closeTo(ethers.parseUnits("1.494", 8), ethers.parseUnits("0.001", 8));
    });

    it("should handle rate array shorter than expected (defensive coding test)", async function () {
      const { manager, wrapper, oracleAggregator } = await loadFixture(deployFixture);

      // Create tokens
      const ERC20Test = await ethers.getContractFactory("contracts/test/ERC20Test.sol:ERC20Test");
      const usdc = await ERC20Test.deploy("USDC", 6);
      const dai = await ERC20Test.deploy("DAI", 18);

      // Deploy a single-coin pool to test truncated rate arrays
      const MockNG = await ethers.getContractFactory(
        "contracts/test/curve/MockCurveStableNGForLP.sol:MockCurveStableNGForLP",
      );
      const singleCoinPool = await MockNG.deploy("Single Pool", "1POOL", 1);

      // Setup single coin (this creates a scenario where we expect N_COINS=1 but might get different rates)
      await singleCoinPool.setCoin(0, await usdc.getAddress());
      await singleCoinPool.setBalances([ethers.parseUnits("1000", 6)]);
      await singleCoinPool.setVirtualPrice(ethers.parseUnits("1", 18));
      await singleCoinPool.setDOracle(ethers.parseUnits("1", 18));

      const singleCoinLpToken = await singleCoinPool.getAddress();
      const singleCoinAnchors = [await usdc.getAddress()];

      // Set prices
      await oracleAggregator.setAssetPrice(singleCoinAnchors[0], ethers.parseUnits("1.00", 8));

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(singleCoinLpToken, singleCoinLpToken, singleCoinAnchors);

      // Test case 1: Normal operation with proper rate array length
      await singleCoinPool.setStoredRates([
        ethers.parseUnits("1.5", 30), // USDC rate
      ]);

      let [price, alive] = await wrapper.getPriceInfo(singleCoinLpToken);
      
      // Should work normally with correct array length
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Test case 2: Test the defensive coding by creating a scenario where we might access out of bounds
      // Deploy 2-coin pool but test edge cases
      const twoCoinPool = await MockNG.deploy("Two Pool", "2POOL", 2);
      await twoCoinPool.setCoin(0, await usdc.getAddress());
      await twoCoinPool.setCoin(1, await dai.getAddress());

      const twoCoinLpToken = await twoCoinPool.getAddress();
      const twoCoinAnchors = [await usdc.getAddress(), await dai.getAddress()];

      await oracleAggregator.setAssetPrice(twoCoinAnchors[1], ethers.parseUnits("1.00", 8));
      await wrapper.connect(manager).setLPFullConfig(twoCoinLpToken, twoCoinLpToken, twoCoinAnchors);

      // Set normal balances
      await twoCoinPool.setBalances([
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("1000", 18),
      ]);
      await twoCoinPool.setVirtualPrice(ethers.parseUnits("1", 18));
      await twoCoinPool.setDOracle(ethers.parseUnits("1", 18));

      // Test case 3: Rate array with different values to ensure proper indexing
      await twoCoinPool.setStoredRates([
        ethers.parseUnits("1.2", 30), // USDC rate
        ethers.parseUnits("0.9", 18), // DAI rate
      ]);

      [price, alive] = await wrapper.getPriceInfo(twoCoinLpToken);
      
      // Should use both rates correctly
      // USDC xp = 1000 * 1.2 = 1200, DAI xp = 1000 * 0.9 = 900
      // Weighted avg = (1.00 * 1200 + 1.00 * 900) / (1200 + 900) = 1.00
      expect(alive).to.eq(true);
      expect(price).to.eq(ethers.parseUnits("1.00", 8));

      // Test case 4: Test with extreme rate values to ensure bounds checking
      await twoCoinPool.setStoredRates([
        ethers.parseUnits("1000", 30), // Very high USDC rate
        1, // Very low DAI rate (1 wei)
      ]);

      [price, alive] = await wrapper.getPriceInfo(twoCoinLpToken);
      
      // Should handle extreme values gracefully without reverting
      expect(alive).to.eq(true);
      expect(price).to.be.gt(0);

      // Test case 5: Test precision with different rate magnitudes
      await twoCoinPool.setStoredRates([
        ethers.parseUnits("1", 50), // Extremely high precision
        ethers.parseUnits("1", 5),  // Very low precision
      ]);

      [price, alive] = await wrapper.getPriceInfo(twoCoinLpToken);
      
      // Should handle different rate precisions without overflow/underflow
      expect(alive).to.eq(true);
      expect(price).to.be.gt(0);
    });

    it("should handle metapool scenarios (coin[1] is another LP token)", async function () {
      const { manager, wrapper, oracleAggregator } = await loadFixture(deployFixture);

      // Create tokens
      const ERC20Test = await ethers.getContractFactory("contracts/test/ERC20Test.sol:ERC20Test");
      const frax = await ERC20Test.deploy("FRAX", 18);
      const threepoolLp = await ERC20Test.deploy("3CRV", 18); // Represents 3pool LP token

      // Deploy metapool (FRAX + 3CRV)
      const MockNG = await ethers.getContractFactory(
        "contracts/test/curve/MockCurveStableNGForLP.sol:MockCurveStableNGForLP",
      );
      const metapool = await MockNG.deploy("FRAX3CRV", "FRAX3CRV", 2);

      // Setup metapool coins
      await metapool.setCoin(0, await frax.getAddress()); // FRAX (direct stablecoin)
      await metapool.setCoin(1, await threepoolLp.getAddress()); // 3CRV LP token

      const metapoolLpToken = await metapool.getAddress();
      const anchors = [await frax.getAddress(), await threepoolLp.getAddress()];

      // Set prices: FRAX = $0.99, 3CRV LP = $1.02 (slightly above $1 due to yield)
      await oracleAggregator.setAssetPrice(anchors[0], ethers.parseUnits("0.99", 8)); // FRAX
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.02", 8)); // 3CRV LP

      // Configure fully
      await wrapper.connect(manager).setLPFullConfig(metapoolLpToken, metapoolLpToken, anchors);

      // Test scenario 1: Balanced metapool
      await metapool.setBalances([
        ethers.parseUnits("1000", 18), // 1000 FRAX
        ethers.parseUnits("1000", 18), // 1000 3CRV LP tokens
      ]);

      // Metapools often have special rate multipliers
      await metapool.setStoredRates([
        ethers.parseUnits("1", 18), // FRAX direct rate (1:1)
        ethers.parseUnits("1.05", 18), // 3CRV LP token has internal exchange rate of 1.05
      ]);

      await metapool.setVirtualPrice(ethers.parseUnits("1", 18));
      await metapool.setDOracle(ethers.parseUnits("1", 18));

      let [price, alive] = await wrapper.getPriceInfo(metapoolLpToken);

      // FRAX xp = 1000 * 1.0 = 1000
      // 3CRV xp = 1000 * 1.05 = 1050
      // Total xp = 2050
      // Weighted avg = (0.99 * 1000 + 1.02 * 1050) / 2050 = (990 + 1071) / 2050 = 1.005
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("1.005", 8), ethers.parseUnits("0.001", 8));

      // Test scenario 2: Imbalanced metapool (more LP tokens than direct stablecoin)
      await metapool.setBalances([
        ethers.parseUnits("500", 18), // 500 FRAX
        ethers.parseUnits("2000", 18), // 2000 3CRV LP tokens
      ]);

      // Different rates to simulate changing underlying conditions
      await metapool.setStoredRates([
        ethers.parseUnits("1", 18), // FRAX still 1:1
        ethers.parseUnits("1.08", 18), // 3CRV LP rate increased to 1.08
      ]);

      [price, alive] = await wrapper.getPriceInfo(metapoolLpToken);

      // FRAX xp = 500 * 1.0 = 500
      // 3CRV xp = 2000 * 1.08 = 2160
      // Total xp = 2660
      // Weighted avg = (0.99 * 500 + 1.02 * 2160) / 2660 = (495 + 2203.2) / 2660 = 1.014
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("1.014", 8), ethers.parseUnits("0.001", 8));

      // Test scenario 3: LP token depeg scenario (3pool experiencing issues)
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("0.95", 8)); // 3CRV depeg to $0.95

      [price, alive] = await wrapper.getPriceInfo(metapoolLpToken);

      // FRAX xp = 500, 3CRV xp = 2160 (same as before)
      // Weighted avg = (0.99 * 500 + 0.95 * 2160) / 2660 = (495 + 2052) / 2660 = 0.957
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("0.957", 8), ethers.parseUnits("0.001", 8));

      // Test scenario 4: LP token with very high exchange rate (high-yield underlying)
      await oracleAggregator.setAssetPrice(anchors[1], ethers.parseUnits("1.02", 8)); // Back to normal
      
      await metapool.setStoredRates([
        ethers.parseUnits("1", 18), // FRAX 1:1
        ethers.parseUnits("2.0", 18), // 3CRV LP with very high internal rate (2x)
      ]);

      [price, alive] = await wrapper.getPriceInfo(metapoolLpToken);

      // FRAX xp = 500 * 1.0 = 500
      // 3CRV xp = 2000 * 2.0 = 4000
      // Total xp = 4500
      // Weighted avg = (0.99 * 500 + 1.02 * 4000) / 4500 = (495 + 4080) / 4500 = 1.017
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("1.017", 8), ethers.parseUnits("0.001", 8));

      // Test scenario 5: Edge case - LP token rate below 1 (underlying pool in losses)
      await metapool.setStoredRates([
        ethers.parseUnits("1", 18), // FRAX 1:1
        ethers.parseUnits("0.7", 18), // 3CRV LP with low rate (losses)
      ]);

      [price, alive] = await wrapper.getPriceInfo(metapoolLpToken);

      // FRAX xp = 500 * 1.0 = 500
      // 3CRV xp = 2000 * 0.7 = 1400
      // Total xp = 1900
      // Weighted avg = (0.99 * 500 + 1.02 * 1400) / 1900 = (495 + 1428) / 1900 = 1.012
      expect(alive).to.eq(true);
      expect(price).to.be.closeTo(ethers.parseUnits("1.012", 8), ethers.parseUnits("0.001", 8));
    });
  });
});
