import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("CurveLPHardPegOracleWrapper", function () {
  async function deployFixture() {
    const [owner, manager, user] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory(
      "contracts/test/MockERC20.sol:MockERC20",
    );
    const usdc = await MockERC20.deploy("USDC", "USDC");
    const dai = await MockERC20.deploy("DAI", "DAI");

    // Deploy NG mock pool (exposes get_virtual_price, D_oracle, stored_rates, get_balances)
    const MockNG = await ethers.getContractFactory(
      "contracts/test/curve/MockCurveStableNG.sol:MockCurveStableNG",
    );
    const curvePool = await MockNG.deploy("Curve USDC-DAI LP", "crvUSDCDAI", 2);

    // Setup pool coins
    await curvePool.setCoin(0, await usdc.getAddress());
    await curvePool.setCoin(1, await dai.getAddress());

    // Default balances
    await curvePool.setBalances([
      ethers.parseUnits("1", 6),
      ethers.parseUnits("1", 18),
    ]);

    // Deploy hard-peg wrapper
    const Wrapper = await ethers.getContractFactory(
      "CurveLPHardPegOracleWrapper",
    );
    const wrapper = await Wrapper.deploy(ethers.parseUnits("1", 8));

    // Grant manager role
    const ORACLE_MANAGER_ROLE = await wrapper.ORACLE_MANAGER_ROLE();
    await wrapper.grantRole(ORACLE_MANAGER_ROLE, manager.address);

    return {
      owner,
      manager,
      user,
      usdc,
      dai,
      curvePool,
      wrapper,
      ORACLE_MANAGER_ROLE,
    };
  }

  it("sets config and prices with hard peg", async function () {
    const { manager, curvePool, wrapper } = await loadFixture(deployFixture);
    const lpToken = await curvePool.getAddress();

    // Configure
    await wrapper.connect(manager).setLPConfig(lpToken, lpToken);

    // virtual price = 1.05
    await curvePool.setVirtualPrice(ethers.parseUnits("1.05", 18));

    const [price, alive] = await wrapper.getPriceInfo(lpToken);
    expect(alive).to.eq(true);
    expect(price).to.eq(ethers.parseUnits("1.05", 8));
  });

  it("reverts when not configured", async function () {
    const { wrapper } = await loadFixture(deployFixture);
    const random = ethers.Wallet.createRandom().address;
    await expect(wrapper.getPriceInfo(random)).to.be.revertedWithCustomError(
      wrapper,
      "LPTokenNotConfigured",
    );
  });

  it("removes config", async function () {
    const { manager, curvePool, wrapper } = await loadFixture(deployFixture);
    const lpToken = await curvePool.getAddress();
    await wrapper.connect(manager).setLPConfig(lpToken, lpToken);
    await wrapper.connect(manager).removeLPConfig(lpToken);
    // reading back should revert on price read
    await expect(wrapper.getPriceInfo(lpToken)).to.be.revertedWithCustomError(
      wrapper,
      "LPTokenNotConfigured",
    );
  });
});
