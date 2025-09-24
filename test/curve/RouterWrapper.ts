import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import hre, { ethers } from "hardhat";

import { CurveRouterWrapper, IERC20 } from "../../typechain-types";
import { CURVE_CONTRACTS, TOKENS, WHALES } from "./registry";

describe("Curve multi-hop swap by exchange function", function () {
  let owner: SignerWithAddress;
  let exchange: CurveRouterWrapper;
  let tokenIn: IERC20;
  let tokenOut: IERC20;

  before(async function () {
    // Skip tests if not on local_ethereum network
    if (hre.network.name !== "local_ethereum") {
      console.log("This test is only run on local_ethereum network");
      this.skip();
    }

    [owner] = await ethers.getSigners();
    // Deploy the Exchange contract
    const feeData = await ethers.provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || undefined;

    const CurveRouterFactory = await ethers.getContractFactory("CurveRouterWrapper");
    exchange = await CurveRouterFactory.deploy(CURVE_CONTRACTS.router, {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    await exchange.waitForDeployment();

    // Connect to the token contracts
    tokenIn = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.DAI.address,
    )) as unknown as IERC20;
    tokenOut = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.USDC.address,
    )) as unknown as IERC20;
  });

  it("swap exact input", async function () {
    const amountIn = ethers.parseUnits("1000", TOKENS.DAI.decimals);

    // Impersonate a whale account to get some tokens
    const whale = await ethers.getImpersonatedSigner(WHALES.binance_pegtokenscollateral);

    // Transfer tokenIn from whale to our test account
    await tokenIn.connect(whale).transfer(owner.address, amountIn);

    // Approve the exchange contract to spend our tokens
    await tokenIn.connect(owner).approve(await exchange.getAddress(), amountIn);

    // generated via https://github.com/curvefi/curve-js
    const route = [
      "0x6b175474e89094c44da98b954eedeac495271d0f",
      "0xb478bf40dd622086e0d0889eebbadcb63806adde",
      "0x15700b564ca08d9439c58ca5053166e8317aa138",
      "0x5f6c431ac417f0f430b84a666a563fabe681da94",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ];
    const swapParams: [
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
    ] = [
      [1, 0, 1, 10, 2],
      [0, 1, 1, 10, 2],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const pools: [string, string, string, string, string] = [
      "0xb478bf40dd622086e0d0889eebbadcb63806adde",
      "0x5f6c431ac417f0f430b84a666a563fabe681da94",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ];

    const minAmountOut = await exchange.getExpectedOutput(route, swapParams, amountIn, pools);

    // Perform the exchange
    const tx = await exchange.swapExactIn(route, swapParams, amountIn, minAmountOut, pools, await tokenIn.getAddress());

    await tx.wait();

    const balanceAfter = await tokenOut.balanceOf(owner.address);

    expect(balanceAfter).to.be.gt(0);
    expect(balanceAfter).to.be.gte(minAmountOut);
  });

  it("swap exact output with 0.01% difference", async function () {
    const amountOut = ethers.parseUnits("800", TOKENS.USDC.decimals);
    const maxAmountIn = ethers.parseUnits("1000", TOKENS.DAI.decimals);

    // Impersonate a whale account to get some tokens
    const whale = await ethers.getImpersonatedSigner(WHALES.binance_pegtokenscollateral);

    // Transfer tokenIn from whale to our test account
    await tokenIn.connect(whale).transfer(owner.address, maxAmountIn);

    // Approve the exchange contract to spend our tokens
    await tokenIn.connect(owner).approve(await exchange.getAddress(), maxAmountIn);

    // generated via https://github.com/curvefi/curve-js
    const route = [
      "0x6b175474e89094c44da98b954eedeac495271d0f", // TOKEN_A
      "0xb478bf40dd622086e0d0889eebbadcb63806adde",
      "0x15700b564ca08d9439c58ca5053166e8317aa138",
      "0x5f6c431ac417f0f430b84a666a563fabe681da94",
      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // TOKEN_B
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ];
    const swapParams: [
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
    ] = [
      [1, 0, 1, 10, 2],
      [0, 1, 1, 10, 2],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const pools: [string, string, string, string, string] = [
      "0xb478bf40dd622086e0d0889eebbadcb63806adde",
      "0x5f6c431ac417f0f430b84a666a563fabe681da94",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ];

    const expectedAmountIn = await exchange.getExpectedInput(route, swapParams, amountOut, pools);
    expect(expectedAmountIn).to.be.gt(0);
    expect(expectedAmountIn).to.be.lte(maxAmountIn);

    const balanceTokenInBefore = await tokenIn.balanceOf(owner.address);
    const balanceTokenOutBefore = await tokenOut.balanceOf(owner.address);

    const tx = await exchange.swapExactOutput(route, swapParams, amountOut, maxAmountIn, pools, await tokenIn.getAddress());

    await tx.wait();

    const balanceTokenOutAfter = await tokenOut.balanceOf(owner.address);

    const actualAmountOut = balanceTokenOutAfter - balanceTokenOutBefore;
    const maxDifference = (amountOut * BigInt(1)) / BigInt(10000); // 0.01% of amountOut
    expect(actualAmountOut).to.be.gte(amountOut);
    expect(actualAmountOut).to.be.lte(amountOut + maxDifference);

    const balanceTokenInAfter = await tokenIn.balanceOf(owner.address);
    expect(balanceTokenInAfter).to.closeTo(balanceTokenInBefore - expectedAmountIn, ethers.parseUnits("1", TOKENS.DAI.decimals));
  });
});
