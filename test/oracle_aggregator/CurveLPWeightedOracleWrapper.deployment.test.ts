import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { deployments, ethers } from "hardhat";

describe("CurveLPWeightedOracleWrapper - Deployment Tests", function () {
  /**
   * Deployment fixture for CurveLPWeightedOracleWrapper tests
   *
   * @returns Test fixture with deployed contracts and test accounts
   */
  async function deploymentFixture(): Promise<{
    owner: any;
    manager: any;
    user: any;
    wrapper: any;
    oracleAggregator: any;
    usdc: any;
    dai: any;
    curvePool: any;
    ORACLE_MANAGER_ROLE: any;
  }> {
    // Start from a fresh deployment
    await deployments.fixture([
      "oracle-aggregator",
      "curve-lp-weighted-oracle-wrapper",
    ]);

    const [owner, manager, user] = await ethers.getSigners();

    // Get deployed contracts
    const wrapperDeployment = await deployments.get(
      "CurveLPWeightedOracleWrapper",
    );
    const wrapper = await ethers.getContractAt(
      "CurveLPWeightedOracleWrapper",
      wrapperDeployment.address,
    );

    const aggregatorDeployment = await deployments.get("OracleAggregator");
    const oracleAggregator = await ethers.getContractAt(
      "IOracleWrapper",
      aggregatorDeployment.address,
    );

    // Deploy mock tokens for testing
    const ERC20Test = await ethers.getContractFactory(
      "contracts/test/ERC20Test.sol:ERC20Test",
    );
    const usdc = await ERC20Test.deploy("USDC", 6);
    const dai = await ERC20Test.deploy("DAI", 18);

    // Deploy mock Curve pool
    const MockNG = await ethers.getContractFactory(
      "contracts/test/curve/MockCurveStableNGForLP.sol:MockCurveStableNGForLP",
    );
    const curvePool = (await MockNG.deploy(
      "Curve USDC-DAI LP",
      "crvUSDCDAI",
      2,
    )) as any;

    // Setup pool
    await curvePool.setCoin(0, await usdc.getAddress());
    await curvePool.setCoin(1, await dai.getAddress());
    await curvePool.setBalances([
      ethers.parseUnits("1000", 6),
      ethers.parseUnits("1000", 18),
    ]);
    await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
    await curvePool.setDOracle(ethers.parseUnits("2000", 18)); // 2000 LP tokens worth

    // Grant manager role
    const ORACLE_MANAGER_ROLE = await wrapper.ORACLE_MANAGER_ROLE();
    await wrapper.grantRole(ORACLE_MANAGER_ROLE, manager.address);

    return {
      owner,
      manager,
      user,
      wrapper,
      oracleAggregator,
      usdc,
      dai,
      curvePool,
      ORACLE_MANAGER_ROLE,
    };
  }

  describe("Deployment validation", function () {
    it("should deploy with correct parameters", async function () {
      const { wrapper, oracleAggregator } =
        await loadFixture(deploymentFixture);

      // Check the wrapper was deployed with correct oracle aggregator
      expect(await wrapper.oracleAggregator()).to.equal(
        await oracleAggregator.getAddress(),
      );

      // Check BASE_CURRENCY_UNIT is set correctly (assuming 8 decimals for USD)
      expect(await wrapper.BASE_CURRENCY_UNIT()).to.equal(
        ethers.parseUnits("1", 8),
      );
    });

    it("should have correct roles setup", async function () {
      const { wrapper, owner } = await loadFixture(deploymentFixture);

      const DEFAULT_ADMIN_ROLE = await wrapper.DEFAULT_ADMIN_ROLE();
      const ORACLE_MANAGER_ROLE = await wrapper.ORACLE_MANAGER_ROLE();

      // Owner should have admin role
      expect(await wrapper.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .true;

      // Admin should be able to grant oracle manager role
      expect(await wrapper.getRoleAdmin(ORACLE_MANAGER_ROLE)).to.equal(
        DEFAULT_ADMIN_ROLE,
      );
    });

    it("should work with deployed oracle aggregator", async function () {
      const { wrapper, manager, curvePool, usdc, dai } =
        await loadFixture(deploymentFixture);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Configure the wrapper
      await wrapper.connect(manager).setLPFullConfig(lpToken, lpToken, anchors);

      // Since we're using the actual deployed OracleAggregator,
      // we need to mock prices if the aggregator supports it
      // For this test, we'll just verify configuration was successful
      const config = await wrapper.lpConfigs(lpToken);
      expect(config.pool).to.equal(lpToken);

      // Verify anchors were set
      const anchor0 = await wrapper.lpAnchorAssets(lpToken, 0);
      const anchor1 = await wrapper.lpAnchorAssets(lpToken, 1);
      expect(anchor0).to.equal(anchors[0]);
      expect(anchor1).to.equal(anchors[1]);
    });
  });

  describe("Integration with mock oracle aggregator", function () {
    it("should calculate prices using deployed infrastructure", async function () {
      const { manager, curvePool, usdc, dai } =
        await loadFixture(deploymentFixture);

      // Deploy a mock oracle aggregator for testing price calculation
      const MockOracleAggregator = await ethers.getContractFactory(
        "MockOracleAggregator",
      );
      const mockAggregator = await MockOracleAggregator.deploy(
        ethers.ZeroAddress,
        ethers.parseUnits("1", 8),
      );

      // Deploy a new wrapper instance with mock aggregator for testing
      const WrapperFactory = await ethers.getContractFactory(
        "CurveLPWeightedOracleWrapper",
      );
      const testWrapper = await WrapperFactory.deploy(
        ethers.parseUnits("1", 8),
        await mockAggregator.getAddress(),
      );

      // Grant manager role
      const ORACLE_MANAGER_ROLE = await testWrapper.ORACLE_MANAGER_ROLE();
      await testWrapper.grantRole(ORACLE_MANAGER_ROLE, manager.address);

      const lpToken = await curvePool.getAddress();
      const anchors = [await usdc.getAddress(), await dai.getAddress()];

      // Set mock prices
      await mockAggregator.setAssetPrice(anchors[0], ethers.parseUnits("1", 8));
      await mockAggregator.setAssetPrice(
        anchors[1],
        ethers.parseUnits("0.99", 8),
      );

      // Configure wrapper
      await testWrapper
        .connect(manager)
        .setLPFullConfig(lpToken, lpToken, anchors);

      // Get price
      const [price, alive] = await testWrapper.getPriceInfo(lpToken);
      expect(alive).to.be.true;
      expect(price).to.equal(ethers.parseUnits("0.995", 8));
    });
  });
});
