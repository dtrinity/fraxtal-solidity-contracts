import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { ICurveStableSwapNG, IERC20 } from "../../typechain-types";
import { POOLS, TOKENS } from "./registry";

describe("Curve StableSwapNG", function () {
  let owner: SignerWithAddress;
  let stableSwap: ICurveStableSwapNG;
  let USDe: IERC20;
  let USDC: IERC20;

  before(async function () {
    // Skip tests if not on local_ethereum network
    if (hre.network.name !== "local_ethereum") {
      console.log("This test is only run on local_ethereum network");
      this.skip();
    }

    [owner] = await ethers.getSigners();

    // Connect to the StableSwapNG contract
    stableSwap = (await ethers.getContractAt("ICurveStableSwapNG", POOLS.stableswapng.USDe_USDC.address)) as ICurveStableSwapNG;

    // Connect to the token contracts
    USDe = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.USDe.address,
    )) as unknown as IERC20;
    USDC = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.USDC.address,
    )) as unknown as IERC20;
  });

  it("should add liquidity to the Curve pool", async function () {
    // Define amounts to deposit
    const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
    const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
    const amounts = [USDeAmount, USDCAmount];

    // Impersonate a whale account to get some tokens
    const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

    // Transfer tokens from whale to our test account
    await USDe.connect(whale).transfer(owner.address, USDeAmount);
    await USDC.connect(whale).transfer(owner.address, USDCAmount);

    // Snapshot the starting USDe and USDC balances
    const USDeBalanceBefore = await USDe.balanceOf(owner.address);
    const USDCBalanceBefore = await USDC.balanceOf(owner.address);

    // Approve the StableSwapNG contract to spend our tokens
    await USDe.connect(owner).approve(POOLS.stableswapng.USDe_USDC.address, USDeAmount);
    await USDC.connect(owner).approve(POOLS.stableswapng.USDe_USDC.address, USDCAmount);

    // The LP token is the same as the pool address
    const lpToken = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20", await stableSwap.getAddress());

    // Snapshot the starting LP token balance
    const lpBalanceBefore = await lpToken.balanceOf(owner.address);

    // Get the expected LP tokens to be minted
    const expectedLPTokens = await stableSwap.calc_token_amount(amounts, true);

    // Add liquidity to the pool
    const minLPTokens = (expectedLPTokens * 99n) / 100n; // 99% of expected LP tokens, 1% max slippage
    const tx = await stableSwap.add_liquidity(amounts, minLPTokens);
    await tx.wait();

    // Check the LP token balance after adding liquidity
    const lpBalanceAfter = await lpToken.balanceOf(owner.address);
    expect(lpBalanceAfter).to.be.gte(lpBalanceBefore + minLPTokens);
    expect(lpBalanceAfter).to.be.lte(lpBalanceBefore + expectedLPTokens);

    // Check that the tokens were transferred from the owner
    const USDeBalanceAfter = await USDe.balanceOf(owner.address);
    const USDCBalanceAfter = await USDC.balanceOf(owner.address);
    expect(USDeBalanceAfter).to.equal(USDeBalanceBefore - USDeAmount);
    expect(USDCBalanceAfter).to.equal(USDCBalanceBefore - USDCAmount);

    // Check that the tokens were added to the pool
    const poolUSDeBalance = await USDe.balanceOf(POOLS.stableswapng.USDe_USDC.address);
    const poolUSDCBalance = await USDC.balanceOf(POOLS.stableswapng.USDe_USDC.address);
    expect(poolUSDeBalance).to.be.gte(USDeAmount);
    expect(poolUSDCBalance).to.be.gte(USDCAmount);
  });

  it("should remove liquidity from the Curve pool", async function () {
    // Define amount of LP tokens to remove
    const lpTokensToRemove = ethers.parseUnits("10", 18); // Assuming 18 decimals for LP token

    // The LP token is the same as the pool address
    const lpToken = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20", await stableSwap.getAddress());

    // Snapshot the starting balances
    const lpBalanceBefore = await lpToken.balanceOf(owner.address);
    const USDeBalanceBefore = await USDe.balanceOf(owner.address);
    const USDCBalanceBefore = await USDC.balanceOf(owner.address);

    // Calculate the minimum amounts to receive (e.g., 99% of the current balance ratio)
    const totalSupply = await lpToken.totalSupply();
    const USDeInPool = await USDe.balanceOf(POOLS.stableswapng.USDe_USDC.address);
    const USDCInPool = await USDC.balanceOf(POOLS.stableswapng.USDe_USDC.address);

    const minUSDeAmount = (USDeInPool * lpTokensToRemove * 99n) / (totalSupply * 100n);
    const minUSDCAmount = (USDCInPool * lpTokensToRemove * 99n) / (totalSupply * 100n);
    const minAmounts = [minUSDeAmount, minUSDCAmount];

    // Approve the StableSwapNG contract to spend our LP tokens
    await lpToken.connect(owner).approve(POOLS.stableswapng.USDe_USDC.address, lpTokensToRemove);

    // Remove liquidity from the pool
    const tx = await stableSwap.remove_liquidity(lpTokensToRemove, minAmounts);
    await tx.wait();

    // Check the LP token balance after removing liquidity
    const lpBalanceAfter = await lpToken.balanceOf(owner.address);
    expect(lpBalanceAfter).to.equal(lpBalanceBefore - lpTokensToRemove);

    // Check that the tokens were transferred to the owner
    const USDeBalanceAfter = await USDe.balanceOf(owner.address);
    const USDCBalanceAfter = await USDC.balanceOf(owner.address);
    expect(USDeBalanceAfter).to.be.gte(USDeBalanceBefore + minUSDeAmount);
    expect(USDCBalanceAfter).to.be.gte(USDCBalanceBefore + minUSDCAmount);
  });

  it("should remove liquidity from the Curve pool for a single coin", async function () {
    // Define amount of LP tokens to remove
    const lpTokensToRemove = ethers.parseUnits("10", 18); // Assuming 18 decimals for LP token

    // The LP token is the same as the pool address
    const lpToken = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20", await stableSwap.getAddress());

    // Snapshot the starting balances
    const lpBalanceBefore = await lpToken.balanceOf(owner.address);
    const USDeBalanceBefore = await USDe.balanceOf(owner.address);

    // Calculate the expected amount of USDe to receive
    const expectedUSDe = await stableSwap.calc_withdraw_one_coin(lpTokensToRemove, 0);

    // Set minimum amount to 99% of expected amount (1% slippage tolerance)
    const minUSDeAmount = (expectedUSDe * 99n) / 100n;

    // Approve the StableSwapNG contract to spend our LP tokens
    await lpToken.connect(owner).approve(POOLS.stableswapng.USDe_USDC.address, lpTokensToRemove);

    // Remove liquidity from the pool for a single coin (USDe)
    const tx = await stableSwap.remove_liquidity_one_coin(lpTokensToRemove, 0, minUSDeAmount);
    await tx.wait();

    // Check the LP token balance after removing liquidity
    const lpBalanceAfter = await lpToken.balanceOf(owner.address);
    expect(lpBalanceAfter).to.equal(lpBalanceBefore - lpTokensToRemove);

    // Check that the USDe tokens were transferred to the owner
    const USDeBalanceAfter = await USDe.balanceOf(owner.address);
    expect(USDeBalanceAfter).to.be.gte(USDeBalanceBefore + minUSDeAmount);
    expect(USDeBalanceAfter).to.be.lte(USDeBalanceBefore + expectedUSDe);
  });

  it("should remove liquidity imbalanced from the Curve pool", async function () {
    // Define imbalanced amounts to remove
    const USDeAmount = ethers.parseUnits("15", TOKENS.USDe.decimals);
    const USDCAmount = ethers.parseUnits("5", TOKENS.USDC.decimals);
    const amounts = [USDeAmount, USDCAmount];

    // The LP token is the same as the pool address
    const lpToken = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20", await stableSwap.getAddress());

    // Snapshot the starting balances
    const lpBalanceBefore = await lpToken.balanceOf(owner.address);
    const USDeBalanceBefore = await USDe.balanceOf(owner.address);
    const USDCBalanceBefore = await USDC.balanceOf(owner.address);

    // Calculate the maximum amount of LP tokens to burn
    const maxBurnAmount = await stableSwap.calc_token_amount(amounts, false);
    const maxBurnAmountWithSlippage = (maxBurnAmount * 101n) / 100n; // Add 1% slippage

    // Approve the StableSwapNG contract to spend our LP tokens
    await lpToken.connect(owner).approve(POOLS.stableswapng.USDe_USDC.address, maxBurnAmountWithSlippage);

    // Remove liquidity imbalanced from the pool
    const tx = await stableSwap.remove_liquidity_imbalance(amounts, maxBurnAmountWithSlippage);
    await tx.wait();

    // Check the LP token balance after removing liquidity
    const lpBalanceAfter = await lpToken.balanceOf(owner.address);
    expect(lpBalanceAfter).to.be.lt(lpBalanceBefore);
    expect(lpBalanceAfter).to.be.gte(lpBalanceBefore - maxBurnAmountWithSlippage);

    // Check that the tokens were transferred to the owner
    const USDeBalanceAfter = await USDe.balanceOf(owner.address);
    const USDCBalanceAfter = await USDC.balanceOf(owner.address);
    expect(USDeBalanceAfter).to.be.gte(USDeBalanceBefore + USDeAmount);
    expect(USDCBalanceAfter).to.be.gte(USDCBalanceBefore + USDCAmount);

    // Check that the actual received amounts are close to the requested amounts
    expect(USDeBalanceAfter - USDeBalanceBefore).to.be.closeTo(USDeAmount, USDeAmount / 100n); // Within 1%
    expect(USDCBalanceAfter - USDCBalanceBefore).to.be.closeTo(USDCAmount, USDCAmount / 100n); // Within 1%
  });
});
