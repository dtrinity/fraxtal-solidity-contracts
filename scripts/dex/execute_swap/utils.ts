import { toHex } from "@uniswap/v3-sdk";
import { ethers } from "ethers";
import hre from "hardhat";

import { SWAP_ROUTER_ID } from "../../../utils/dex/deploy-ids";
import { fetchTokenInfo } from "../../../utils/token";

/**
 * Add liquidity to the DEX pools
 *
 * @param feeTier Fee tier for the swap
 * @param inputTokenAddress Address of the input token
 * @param outputTokenAddress Address of the output token
 * @param inputTokenAmount Amount of input token to swap
 * @param deadlineInSeconds Deadline for the swap in seconds
 * @returns The transaction response
 */
export async function executeSwap(
  feeTier: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  inputTokenAmount: number,
  deadlineInSeconds: number,
): Promise<ethers.ContractTransaction> {
  const { dexDeployer } = await hre.getNamedAccounts();

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);

  // Approve the router to spend the token
  const inputTokenContract = await hre.ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    inputTokenAddress,
    await hre.ethers.getSigner(dexDeployer),
  );

  const approveTxn = await inputTokenContract.approve(
    routerAddress,
    ethers.MaxUint256,
  );

  console.log("Approving SwapRouter to spend the input token");
  console.log(approveTxn?.hash);

  const routerContract = await hre.ethers.getContractAt(
    "SwapRouter",
    routerAddress,
    await hre.ethers.getSigner(dexDeployer),
  );

  const inputTokenInfo = await fetchTokenInfo(hre, inputTokenAddress);

  const inputTokenAmountOnChainInt = ethers.parseUnits(
    inputTokenAmount.toString(),
    inputTokenInfo.decimals,
  );

  console.log("Swapping tokens");
  const swapTxn = await routerContract.exactInputSingle({
    tokenIn: inputTokenAddress,
    tokenOut: outputTokenAddress,
    fee: feeTier,
    recipient: dexDeployer,
    deadline: toHex(Math.floor(Date.now() / 1000) + deadlineInSeconds),
    amountIn: inputTokenAmountOnChainInt,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  });

  console.log(swapTxn.hash);
  return swapTxn;
}
