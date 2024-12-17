import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import hre, { ethers } from "hardhat";

import { CurveRouterNgPoolsOnlyV1Wrapper, IERC20 } from "../../typechain-types";
import {
  FRAXTAL_TESTNET_CURVE_CONTRACTS,
  FRAXTAL_TESTNET_TOKENS,
} from "./registry";

describe("Curve multi-hop swap by exchange function", function () {
  let owner: SignerWithAddress;
  let exchange: CurveRouterNgPoolsOnlyV1Wrapper;
  let tokenIn: IERC20;
  let tokenOut: IERC20;

  before(async function () {
    if (hre.network.name !== "fraxtal_testnet") {
      console.log("This test is only run on fraxtal_testnet network");
      this.skip();
    }

    [owner] = await ethers.getSigners();
    // Deploy the Exchange contract
    const feeData = await ethers.provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || undefined;

    const CurveRouterFactory = await ethers.getContractFactory(
      "CurveRouterNgPoolsOnlyV1Wrapper",
    );
    exchange = await CurveRouterFactory.deploy(
      FRAXTAL_TESTNET_CURVE_CONTRACTS.router,
      {
        maxFeePerGas,
        maxPriorityFeePerGas,
      },
    );
    await exchange.waitForDeployment();
    console.log("Exchange deployed at: ", await exchange.getAddress());
    // Connect to the token contracts
    tokenIn = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      FRAXTAL_TESTNET_TOKENS.dUSD.address,
    )) as unknown as IERC20;
    tokenOut = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      FRAXTAL_TESTNET_TOKENS.sFRAX.address,
    )) as unknown as IERC20;
  });

  it("swap exact input", async function () {
    const amountIn = ethers.parseUnits(
      "1",
      FRAXTAL_TESTNET_TOKENS.dUSD.decimals,
    );
    const { dusdDeployer } = await hre.getNamedAccounts();
    const funder = await ethers.getSigner(dusdDeployer);

    await tokenIn.connect(funder).transfer(owner.address, amountIn);
    await tokenIn
      .connect(funder)
      .approve(await exchange.getAddress(), amountIn);

    const route = [
      "0x4d6e79013212f10a026a1fb0b926c9fd0432b96c",
      "0x93f785642837e082ff95bb69e64e5b6967857c74",
      "0x2cab811d351b4ef492d8c197e09939f1c9f54330",
      "0x6a7173ea306983f3721cc9a3c6ea7f0a3a2f3c13",
      "0x0dbf64462fec588df32fc5c9941421f7d93e0fb3",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ];
    const swapParams: [
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
    ] = [
      [0, 1, 1, 2],
      [0, 1, 1, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];

    const minAmountOut = await exchange.getExpectedOutput(
      route,
      swapParams,
      amountIn,
    );

    const tx = await exchange.swapExactIn(
      route,
      swapParams,
      amountIn,
      minAmountOut,
      await tokenIn.getAddress(),
    );

    await tx.wait();

    const balanceAfter = await tokenOut.balanceOf(owner.address);

    expect(balanceAfter).to.be.gt(0);
    expect(balanceAfter).to.be.gte(minAmountOut);
  });

  it("swap exact output with 0.01% difference", async function () {
    const amountOut = ethers.parseUnits(
      "8",
      FRAXTAL_TESTNET_TOKENS.sFRAX.decimals,
    );
    const maxAmountIn = ethers.parseUnits(
      "10",
      FRAXTAL_TESTNET_TOKENS.dUSD.decimals,
    );

    const { dusdDeployer } = await hre.getNamedAccounts();
    const funder = await ethers.getSigner(dusdDeployer);

    await tokenIn.connect(funder).transfer(owner.address, maxAmountIn);

    // Approve the exchange contract to spend our tokens
    await tokenIn
      .connect(owner)
      .approve(await exchange.getAddress(), maxAmountIn);

    const route = [
      "0x4d6e79013212f10a026a1fb0b926c9fd0432b96c", // TOKEN_A (dUSD)
      "0x93f785642837e082ff95bb69e64e5b6967857c74",
      "0x2cab811d351b4ef492d8c197e09939f1c9f54330",
      "0x6a7173ea306983f3721cc9a3c6ea7f0a3a2f3c13",
      "0x0dbf64462fec588df32fc5c9941421f7d93e0fb3", // TOKEN_B (sFRAX)
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ];
    const swapParams: [
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      [BigNumberish, BigNumberish, BigNumberish, BigNumberish],
    ] = [
      [0, 1, 1, 2],
      [0, 1, 1, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];

    const expectedAmountIn = await exchange.getExpectedInput(
      route,
      swapParams,
      amountOut,
    );
    expect(expectedAmountIn).to.be.gt(0);
    expect(expectedAmountIn).to.be.lte(maxAmountIn);

    const balanceTokenInBefore = await tokenIn.balanceOf(owner.address);
    const balanceTokenOutBefore = await tokenOut.balanceOf(owner.address);

    const tx = await exchange.swapExactOutput(
      route,
      swapParams,
      amountOut,
      maxAmountIn,
      await tokenIn.getAddress(),
    );

    await tx.wait();

    const balanceTokenOutAfter = await tokenOut.balanceOf(owner.address);

    const actualAmountOut = balanceTokenOutAfter - balanceTokenOutBefore;
    const maxDifference = (amountOut * BigInt(1)) / BigInt(10000); // 0.01% of amountOut
    expect(actualAmountOut).to.be.gte(amountOut);
    expect(actualAmountOut).to.be.lte(amountOut + maxDifference);

    const balanceTokenInAfter = await tokenIn.balanceOf(owner.address);
    expect(balanceTokenInAfter).to.closeTo(
      balanceTokenInBefore - expectedAmountIn,
      ethers.parseUnits("1", FRAXTAL_TESTNET_TOKENS.dUSD.decimals),
    );
  });
});
