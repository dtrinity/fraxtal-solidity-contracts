import { expect } from "chai";
import { ethers } from "hardhat";

describe("dLEND directional rounding", function () {
  const RAY = 10n ** 27n;
  const WAD = 10n ** 18n;
  const LIVE_DUSD_LIQUIDITY_INDEX = 1092999621896032150128470224n;
  const LIVE_DUSD_VARIABLE_BORROW_INDEX = 1124411779241122369413420458n;
  const rayDivCeil = (amount: bigint, index: bigint) => (amount === 0n ? 0n : (amount * RAY + index - 1n) / index);

  async function deployHarnesses() {
    const [deployer, treasury, user, recipient] = await ethers.getSigners();

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

    return { pool, underlying, aToken, variableDebtToken, deployer, user, recipient };
  }

  async function deployATokenLoopHarnesses() {
    const [, treasury, user] = await ethers.getSigners();

    const providerFactory = await ethers.getContractFactory("RoundingPoolAddressesProviderMock");
    const provider = await providerFactory.deploy();
    await provider.waitForDeployment();

    const poolFactory = await ethers.getContractFactory("RoundingPoolMock");
    const pool = await poolFactory.deploy(await provider.getAddress());
    await pool.waitForDeployment();

    const underlyingFactory = await ethers.getContractFactory(
      "contracts/lending/core/mocks/tokens/MintableERC20.sol:MintableERC20",
    );

    const fixedUnderlying = await underlyingFactory.deploy("Fixed Underlying", "FIX", 6);
    await fixedUnderlying.waitForDeployment();

    const legacyUnderlying = await underlyingFactory.deploy("Legacy Underlying", "LEG", 6);
    await legacyUnderlying.waitForDeployment();

    const fixedFactory = await ethers.getContractFactory("ATokenHarness");
    const fixedAToken = await fixedFactory.deploy(await pool.getAddress());
    await fixedAToken.waitForDeployment();
    await fixedAToken.initialize(
      await pool.getAddress(),
      treasury.address,
      await fixedUnderlying.getAddress(),
      ethers.ZeroAddress,
      6,
      "Fixed AToken",
      "faFIX",
      "0x",
    );

    const legacyFactory = await ethers.getContractFactory("LegacyATokenHarness");
    const legacyAToken = await legacyFactory.deploy(await pool.getAddress());
    await legacyAToken.waitForDeployment();
    await legacyAToken.initialize(
      await pool.getAddress(),
      treasury.address,
      await legacyUnderlying.getAddress(),
      ethers.ZeroAddress,
      6,
      "Legacy AToken",
      "laLEG",
      "0x",
    );

    await pool.setReserveNormalizedIncome(await fixedUnderlying.getAddress(), LIVE_DUSD_LIQUIDITY_INDEX);
    await pool.setReserveNormalizedIncome(await legacyUnderlying.getAddress(), LIVE_DUSD_LIQUIDITY_INDEX);

    return { pool, user, fixedUnderlying, legacyUnderlying, fixedAToken, legacyAToken };
  }

  async function runSupplyWithdrawLoop(args: {
    underlying: any;
    token: any;
    user: any;
    depositAmount: bigint;
    loopCount: number;
    legacy: boolean;
  }) {
    const { underlying, token, user, depositAmount, loopCount, legacy } = args;
    let totalProfit = 0n;

    await underlying["mint(address,uint256)"](await token.getAddress(), 1000n);

    for (let i = 0; i < loopCount; i++) {
      const before = await underlying.balanceOf(user.address);

      await underlying["mint(address,uint256)"](user.address, depositAmount);
      await underlying.connect(user).transfer(await token.getAddress(), depositAmount);

      if (legacy) {
        await token.legacyMint(user.address, user.address, depositAmount, LIVE_DUSD_LIQUIDITY_INDEX);
        expect(await token.scaledBalanceOf(user.address)).to.equal(27n);
        const claimAmount = await token.legacyBalanceOf(user.address);
        expect(claimAmount).to.equal(30n);
        await token.legacyWithdraw(user.address, user.address, claimAmount, LIVE_DUSD_LIQUIDITY_INDEX);
      } else {
        await token.harnessMint(user.address, user.address, depositAmount, LIVE_DUSD_LIQUIDITY_INDEX);
        expect(await token.scaledBalanceOf(user.address)).to.equal(26n);
        const claimAmount = await token.balanceOf(user.address);
        expect(claimAmount).to.equal(28n);
        await token.harnessWithdraw(user.address, user.address, claimAmount, LIVE_DUSD_LIQUIDITY_INDEX);
      }

      const after = await underlying.balanceOf(user.address);
      totalProfit += after - before - depositAmount;

      expect(await token.scaledBalanceOf(user.address)).to.equal(0n);
      expect(await token.balanceOf(user.address)).to.equal(0n);
    }

    return totalProfit;
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

  it("ceils transfer scaling and emits BalanceTransfer with the moved scaled amount", async function () {
    const { pool, underlying, aToken, deployer, user, recipient } = await deployHarnesses();
    const index = 2n * RAY + 1n;
    const supplyAmount = 8n * WAD;
    const transferAmount = 7n * WAD - 5n;
    const expectedScaledTransfer = rayDivCeil(transferAmount, index);

    await pool.setReserveNormalizedIncome(await underlying.getAddress(), index);
    await aToken.harnessMint(deployer.address, user.address, supplyAmount, index);

    const transferTx = await aToken.connect(user).transfer(recipient.address, transferAmount);
    await expect(transferTx).to.emit(aToken, "Transfer").withArgs(user.address, recipient.address, transferAmount);
    await expect(transferTx)
      .to.emit(aToken, "BalanceTransfer")
      .withArgs(user.address, recipient.address, expectedScaledTransfer, index);

    expect(await aToken.scaledBalanceOf(user.address)).to.equal(500000000000000001n);
    expect(await aToken.scaledBalanceOf(recipient.address)).to.equal(expectedScaledTransfer);
    expect(await aToken.balanceOf(user.address)).to.equal(1000000000000000002n);
    expect(await aToken.balanceOf(recipient.address)).to.equal(6999999999999999996n);
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

  it("reproduces the legacy supply-withdraw extraction loop and shows the fix makes it non-profitable", async function () {
    const { user, fixedUnderlying, legacyUnderlying, fixedAToken, legacyAToken } = await deployATokenLoopHarnesses();
    const depositAmount = 29n;
    const loopCount = 10;

    const legacyProfit = await runSupplyWithdrawLoop({
      underlying: legacyUnderlying,
      token: legacyAToken,
      user,
      depositAmount,
      loopCount,
      legacy: true,
    });

    const fixedProfit = await runSupplyWithdrawLoop({
      underlying: fixedUnderlying,
      token: fixedAToken,
      user,
      depositAmount,
      loopCount,
      legacy: false,
    });

    expect(legacyProfit).to.equal(10n);
    expect(fixedProfit).to.be.at.most(0n);
  });
});
