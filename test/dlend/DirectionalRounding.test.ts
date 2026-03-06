import { expect } from "chai";
import { ethers } from "hardhat";

describe("dLEND directional rounding", function () {
  const RAY = 10n ** 27n;
  const WAD = 10n ** 18n;
  const LIVE_DUSD_LIQUIDITY_INDEX = 1092999621896032150128470224n;
  const LIVE_DUSD_VARIABLE_BORROW_INDEX = 1124411779241122369413420458n;

  async function deployHarnesses() {
    const [deployer, treasury, user] = await ethers.getSigners();

    const providerFactory = await ethers.getContractFactory("RoundingPoolAddressesProviderMock");
    const provider = await providerFactory.deploy();
    await provider.waitForDeployment();

    const poolFactory = await ethers.getContractFactory("RoundingPoolMock");
    const pool = await poolFactory.deploy(await provider.getAddress());
    await pool.waitForDeployment();

    const underlyingFactory = await ethers.getContractFactory(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
    );
    const underlying = await underlyingFactory.deploy("Mock Underlying", "MCK", 18);
    await underlying.waitForDeployment();

    const aTokenFactory = await ethers.getContractFactory("ATokenHarness");
    const aToken = await aTokenFactory.deploy(await pool.getAddress());
    await aToken.waitForDeployment();
    await aToken.initialize(
      await pool.getAddress(),
      treasury.address,
      await underlying.getAddress(),
      ethers.ZeroAddress,
      18,
      "Mock AToken",
      "mATK",
      "0x",
    );

    const variableDebtFactory = await ethers.getContractFactory("VariableDebtTokenHarness");
    const variableDebtToken = await variableDebtFactory.deploy(await pool.getAddress());
    await variableDebtToken.waitForDeployment();
    await variableDebtToken.initialize(
      await pool.getAddress(),
      await underlying.getAddress(),
      ethers.ZeroAddress,
      18,
      "Mock Variable Debt",
      "mVDT",
      "0x",
    );

    return { pool, underlying, aToken, variableDebtToken, deployer, user };
  }

  it("floors aToken balances at the live dUSD liquidity index", async function () {
    const { pool, underlying, aToken, deployer, user } = await deployHarnesses();
    const rawAmount = 29n;

    await pool.setReserveNormalizedIncome(await underlying.getAddress(), LIVE_DUSD_LIQUIDITY_INDEX);
    await aToken.harnessMint(deployer.address, user.address, rawAmount, LIVE_DUSD_LIQUIDITY_INDEX);

    expect(await aToken.scaledBalanceOf(user.address)).to.equal(26n);
    expect(await aToken.balanceOf(user.address)).to.equal(28n);

    await aToken.harnessBurn(user.address, await aToken.getAddress(), await aToken.balanceOf(user.address), LIVE_DUSD_LIQUIDITY_INDEX);

    expect(await aToken.scaledBalanceOf(user.address)).to.equal(0n);
    expect(await aToken.balanceOf(user.address)).to.equal(0n);
  });

  it("ceils variable debt balances at the live dUSD borrow index", async function () {
    const { pool, underlying, variableDebtToken, user } = await deployHarnesses();
    const rawAmount = 5n;

    await pool.setReserveNormalizedVariableDebt(await underlying.getAddress(), LIVE_DUSD_VARIABLE_BORROW_INDEX);
    await variableDebtToken.harnessMint(user.address, user.address, rawAmount, LIVE_DUSD_VARIABLE_BORROW_INDEX);

    expect(await variableDebtToken.scaledBalanceOf(user.address)).to.equal(5n);
    expect(await variableDebtToken.balanceOf(user.address)).to.equal(6n);

    await variableDebtToken.harnessBurn(user.address, await variableDebtToken.balanceOf(user.address), LIVE_DUSD_VARIABLE_BORROW_INDEX);

    expect(await variableDebtToken.scaledBalanceOf(user.address)).to.equal(0n);
    expect(await variableDebtToken.balanceOf(user.address)).to.equal(0n);
  });

  it("matches the upstream floor semantics for aToken mint and burn", async function () {
    const { pool, underlying, aToken, deployer, user } = await deployHarnesses();
    const index = 2n * RAY + 1n;
    const supplyAmount = 8n * WAD;

    await pool.setReserveNormalizedIncome(await underlying.getAddress(), index);
    await aToken.harnessMint(deployer.address, user.address, supplyAmount, index);

    expect(await aToken.scaledBalanceOf(user.address)).to.equal(4n * WAD - 1n);
    expect(await aToken.balanceOf(user.address)).to.equal(8n * WAD - 2n);
    expect(await aToken.totalSupply()).to.equal(8n * WAD - 2n);

    await aToken.harnessBurn(user.address, await aToken.getAddress(), await aToken.balanceOf(user.address), index);

    expect(await aToken.scaledBalanceOf(user.address)).to.equal(0n);
    expect(await aToken.balanceOf(user.address)).to.equal(0n);
  });

  it("matches the upstream ceil semantics for variable debt mint and burn", async function () {
    const { pool, underlying, variableDebtToken, user } = await deployHarnesses();
    const index = 2n * RAY + 1n;
    const borrowedAmount = 7n * WAD - 5n;

    await pool.setReserveNormalizedVariableDebt(await underlying.getAddress(), index);
    await variableDebtToken.harnessMint(user.address, user.address, borrowedAmount, index);

    expect(await variableDebtToken.scaledBalanceOf(user.address)).to.equal(3500000000000000000n - 2n);
    expect(await variableDebtToken.balanceOf(user.address)).to.equal(7n * WAD - 3n);
    expect(await variableDebtToken.totalSupply()).to.equal(7n * WAD - 3n);

    await variableDebtToken.harnessBurn(user.address, await variableDebtToken.balanceOf(user.address), index);

    expect(await variableDebtToken.scaledBalanceOf(user.address)).to.equal(0n);
    expect(await variableDebtToken.balanceOf(user.address)).to.equal(0n);
  });
});
