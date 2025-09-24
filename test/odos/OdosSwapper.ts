import { expect } from "chai";
import { Wallet } from "ethers";
import hre, { ethers } from "hardhat";

import { OdosSwapper } from "../../typechain-types";
import { IERC20 } from "../../typechain-types/@openzeppelin/contracts-5/token/ERC20/IERC20";
import { decodeCustomError } from "../../utils/decode";
import { OdosClient } from "../../utils/odos/client";

describe("OdosSwapper Integration Tests", () => {
  before(function () {
    if (hre.network.name !== "fraxtal_mainnet") {
      console.log("Skipping OdosSwapper tests - only run on fraxtal_mainnet");
      this.skip();
    }
  });

  let odosSwapper: OdosSwapper;
  let owner: Wallet;
  let odosClient: OdosClient;
  let swapperAddress: string;
  let frax: IERC20;

  // Mainnet addresses
  const ODOS_ROUTER = "0x56c85a254dd12ee8d9c04049a4ab62769ce98210";
  const ODOS_API_URL = "https://api.odos.xyz";
  const FRAX = "0xFc00000000000000000000000000000000000001";
  const sFRAX = "0xfc00000000000000000000000000000000000008";
  const chainId = 252;

  /**
   * Gets the balance of a specific token for a given address
   *
   * @param token - The address of the token contract
   * @param address - The address to check the balance for
   * @returns The token balance as a bigint
   */
  async function getTokenBalance(token: string, address: string): Promise<bigint> {
    const tokenContract = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20", token);
    return await tokenContract.balanceOf(address);
  }

  /**
   * Verifies that the swapper contract has no remaining balance of input or output tokens
   *
   * @param inputToken - The address of the input token contract
   * @param outputToken - The address of the output token contract
   * @returns A Promise that resolves when verification is complete
   */
  async function verifyNoLeftoverTokens(inputToken: string, outputToken: string): Promise<void> {
    const swapperInputBalance = await getTokenBalance(inputToken, await odosSwapper.getAddress());
    const swapperOutputBalance = await getTokenBalance(outputToken, await odosSwapper.getAddress());

    expect(swapperInputBalance).to.equal(0n, "Swapper should have no input tokens left");
    expect(swapperOutputBalance).to.equal(0n, "Swapper should have no output tokens left");
  }

  before(async () => {
    const PRIVATE_KEY = process.env.PK_FRAXTAL_MAINNET_LIQUIDATOR_BOT || "";
    const executor = new ethers.Wallet(PRIVATE_KEY);
    owner = executor.connect(ethers.provider);
    const OdosSwapper = await ethers.getContractFactory("OdosSwapper");
    odosSwapper = await OdosSwapper.deploy(ODOS_ROUTER);
    await odosSwapper.waitForDeployment();
    swapperAddress = await odosSwapper.getAddress();

    odosClient = new OdosClient(ODOS_API_URL, chainId);

    frax = (await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20", FRAX)) as unknown as IERC20;
  });

  it("should execute FRAX -> sFRAX swap with exact output", async () => {
    const inputToken = FRAX;
    const outputToken = sFRAX;
    const minOutputAmount = "1";

    // Record initial balances
    const initialUserFraxBalance = await getTokenBalance(FRAX, await owner.getAddress());
    const initialUserSfraxBalance = await getTokenBalance(sFRAX, await owner.getAddress());
    const inputAmount = await odosClient.calculateInputAmount(minOutputAmount, outputToken, inputToken, chainId, 0.1);
    const formattedInputAmount = OdosClient.formatTokenAmount(inputAmount, 18);
    const formattedMinOutputAmount = OdosClient.formatTokenAmount(minOutputAmount, 18);

    // Get quote from Odos API
    const quoteRequest = {
      chainId: chainId,
      inputTokens: [{ tokenAddress: inputToken, amount: formattedInputAmount }],
      outputTokens: [{ tokenAddress: outputToken, proportion: 1 }],
      userAddr: await owner.getAddress(),
      slippageLimitPercent: 0.5,
    };

    const quote = await odosClient.getQuote(quoteRequest);
    const assembleRequest = {
      chainId: chainId,
      pathId: quote.pathId,
      userAddr: await owner.getAddress(),
      simulate: true,
    };

    // Approve router to spend input token before assembled due to simulation
    const approveRouterTx = await frax.connect(owner).approve(ODOS_ROUTER, quote.inAmounts[0]);
    await approveRouterTx.wait();
    console.log("Approved frax to router at tx ", approveRouterTx.hash);

    const assembled = await odosClient.assembleTransaction(assembleRequest);
    // Execute swap
    const approveSwapperTx = await frax.connect(owner).approve(swapperAddress, quote.inAmounts[0]);
    await approveSwapperTx.wait();
    console.log("Approved frax to swapper at tx ", approveSwapperTx.hash);

    try {
      const tx = await odosSwapper
        .connect(owner)
        .executeSwapOperation(inputToken, quote.inAmounts[0], formattedMinOutputAmount, assembled.transaction.data);

      await tx.wait();
      console.log("tx", tx.hash);
    } catch (error: any) {
      const decodedError = decodeCustomError(error);
      console.log("Decoded error:", decodedError);
      throw error;
    }
    // Verify final balances
    const finalUserFraxBalance = await getTokenBalance(FRAX, await owner.getAddress());
    const finalUserSfraxBalance = await getTokenBalance(sFRAX, await owner.getAddress());

    // Verify exact output amount received
    const diff =
      finalUserSfraxBalance > initialUserSfraxBalance + BigInt(quote.outAmounts[0])
        ? finalUserSfraxBalance - (initialUserSfraxBalance + BigInt(quote.outAmounts[0]))
        : initialUserSfraxBalance + BigInt(quote.outAmounts[0]) - finalUserSfraxBalance;
    expect(diff * 1000n).to.be.lt(BigInt(quote.outAmounts[0]), "User should receive sFRAX amount within 0.1% of expected");

    // Verify input amount used is less than or equal to quote
    expect(initialUserFraxBalance - finalUserFraxBalance).to.be.lte(BigInt(quote.inAmounts[0]), "Input amount should not exceed quote");

    // Verify no tokens left in contract
    await verifyNoLeftoverTokens(inputToken, outputToken);
  });
});
