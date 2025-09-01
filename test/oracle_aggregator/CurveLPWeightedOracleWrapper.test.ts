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
});
