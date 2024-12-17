import { ethers } from "ethers";
import hre from "hardhat";

import {
  AaveOracle,
  MockStaticOracleWrapper,
  StaticOracleWrapper,
} from "../../typechain-types";
import { deployContract } from "../../utils/deploy";
import {
  SWAP_ROUTER_ID,
  UNISWAP_STATIC_ORACLE_WRAPPER_ID,
} from "../../utils/dex/deploy-ids";
import {
  addPoolLiquidity,
  deployPool,
  getDEXPoolAddress,
  getDEXPoolAddressForPair,
} from "../../utils/dex/pool";
import { convertToSwapPath } from "../../utils/dex/utils";
import { ORACLE_ID } from "../../utils/lending/deploy-ids";
import { getDecimals } from "../../utils/maths/utils";
import { getTokenContractForAddress } from "../../utils/utils";

/**
 * Create a pool and add liquidity to it
 *
 * @param callerAddress Address of the caller
 * @param feeTier Fee tier for the pool
 * @param token0Address Address of the first token
 * @param token1Address Address of the second token
 * @param token0Amount Amount of the first token to add, determines starting price
 * @param token1Amount Amount of the second token to add, determines starting price
 * @param deadlineInSeconds Deadline for txn timeout
 */
export async function createPoolAddLiquidityWithApproval(
  callerAddress: string,
  feeTier: number,
  token0Address: string,
  token1Address: string,
  token0Amount: number,
  token1Amount: number,
  deadlineInSeconds: number,
): Promise<void> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const poolDeployResult = await deployPool(
    hre,
    signer,
    token0Address,
    token1Address,
    feeTier,
    token0Amount,
    token1Amount,
    5e6, // Typically uses 4.6M gas
  );

  if (poolDeployResult.receipt?.status !== 1) {
    throw new Error("Pool deployment failed");
  }

  const { tokenInfo: token0Info } = await getTokenContractForAddress(
    callerAddress,
    token0Address,
  );
  const { tokenInfo: token1Info } = await getTokenContractForAddress(
    callerAddress,
    token1Address,
  );

  const addLiquidityResult = await addPoolLiquidity(
    hre,
    poolDeployResult.poolAddress,
    token0Info,
    token1Info,
    token0Amount,
    signer,
    1e6, // Typically uses around 600k gas
    deadlineInSeconds,
  );

  if (addLiquidityResult.addLiquidityReceipt?.status !== 1) {
    throw new Error("Add liquidity failed");
  }
}

/**
 * Swap an exact amount of input token for an output token
 *
 * @param callerAddress Address of the caller
 * @param feeTier Fee tier for the swap
 * @param inputTokenAddress Address of the input token
 * @param outputTokenAddress Address of the output token
 * @param inputTokenAmount Amount of input token to swap
 * @param deadlineInSeconds Deadline for the swap in seconds
 * @returns The transaction response
 */
export async function swapExactInputSingleWithApproval(
  callerAddress: string,
  feeTier: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  inputTokenAmount: number,
  deadlineInSeconds: number,
): Promise<void> {
  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const signer = await hre.ethers.getSigner(callerAddress);

  const { contract: inputTokenContract, tokenInfo: inputTokenInfo } =
    await getTokenContractForAddress(callerAddress, inputTokenAddress);

  // Approve the router to spend the token
  await inputTokenContract.approve(routerAddress, ethers.MaxUint256);

  const routerContract = await hre.ethers.getContractAt(
    SWAP_ROUTER_ID,
    routerAddress,
    signer,
  );

  const inputTokenAmountOnChainInt = ethers.parseUnits(
    inputTokenAmount.toString(),
    inputTokenInfo.decimals,
  );

  const dexPoolAddress = await getDEXPoolAddress(
    inputTokenAddress,
    outputTokenAddress,
    feeTier,
  );

  if (dexPoolAddress == hre.ethers.ZeroAddress) {
    throw new Error(
      `Pool does not exist for ${inputTokenAddress} and ${outputTokenAddress} with fee tier ${feeTier}`,
    );
  }

  const swapTxn = await routerContract.exactInputSingle({
    tokenIn: inputTokenAddress,
    tokenOut: outputTokenAddress,
    fee: feeTier,
    recipient: callerAddress,
    deadline: Math.floor(Date.now() / 1000) + deadlineInSeconds,
    amountIn: inputTokenAmountOnChainInt,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  });
  const swapReceipt = await swapTxn.wait();

  if (swapReceipt?.status !== 1) {
    throw new Error("Swap failed");
  }
}

/**
 * Swap an exact amount of output token for an input token
 *
 * @param callerAddress - The address of the caller
 * @param feeTier - The fee tier for the swap
 * @param inputTokenAddress - The address of the input token
 * @param outputTokenAddress - The address of the output token
 * @param outputTokenAmount - The amount of output token to swap
 * @param deadlineInSeconds - The deadline for the swap in seconds
 */
export async function swapExactOutputSingleWithApproval(
  callerAddress: string,
  feeTier: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  outputTokenAmount: number,
  deadlineInSeconds: number,
): Promise<void> {
  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const signer = await hre.ethers.getSigner(callerAddress);

  const { contract: inputTokenContract } = await getTokenContractForAddress(
    callerAddress,
    inputTokenAddress,
  );
  const { tokenInfo: outputTokenInfo } = await getTokenContractForAddress(
    callerAddress,
    outputTokenAddress,
  );

  // Approve the router to spend the token
  await inputTokenContract.approve(routerAddress, ethers.MaxUint256);

  const routerContract = await hre.ethers.getContractAt(
    SWAP_ROUTER_ID,
    routerAddress,
    signer,
  );

  const outputTokenAmountOnChainInt = ethers.parseUnits(
    outputTokenAmount.toString(),
    outputTokenInfo.decimals,
  );

  const dexPoolAddress = await getDEXPoolAddress(
    inputTokenAddress,
    outputTokenAddress,
    feeTier,
  );

  if (dexPoolAddress == hre.ethers.ZeroAddress) {
    throw new Error(
      `Pool does not exist for ${inputTokenAddress} and ${outputTokenAddress} with fee tier ${feeTier}`,
    );
  }

  const swapTxn = await routerContract.exactOutputSingle({
    tokenIn: inputTokenAddress,
    tokenOut: outputTokenAddress,
    fee: feeTier,
    recipient: callerAddress,
    deadline: Math.floor(Date.now() / 1000) + deadlineInSeconds,
    amountOut: outputTokenAmountOnChainInt,
    amountInMaximum: ethers.MaxUint256,
    sqrtPriceLimitX96: 0,
  });

  const swapReceipt = await swapTxn.wait();

  if (swapReceipt?.status !== 1) {
    throw new Error("Swap failed");
  }
}

/**
 * Swap an exact amount of input token for an output token in a multi-hop swap
 * - It will search for the existing fee tier pool for each pair of tokens in the path
 *
 * @param callerAddress - The address of the caller
 * @param tokenPaths - The token address paths for the swap (e.g., [inputToken, token0, ..., outputToken])
 * @param inputTokenAmount - The amount of input token to swap
 * @param deadlineInSeconds - The deadline for the swap in seconds
 */
export async function swapExactInputMultiWithApproval(
  callerAddress: string,
  tokenPaths: string[],
  inputTokenAmount: number,
  deadlineInSeconds: number,
): Promise<void> {
  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const signer = await hre.ethers.getSigner(callerAddress);

  const routerContract = await hre.ethers.getContractAt(
    SWAP_ROUTER_ID,
    routerAddress,
    signer,
  );

  if (tokenPaths.length < 2) {
    throw new Error(`Token paths must have at least 2 tokens: ${tokenPaths}`);
  }

  const inputTokenAddress = tokenPaths[0];
  const { contract: inputTokenContract, tokenInfo: inputTokenInfo } =
    await getTokenContractForAddress(callerAddress, inputTokenAddress);

  const inputTokenAmountOnChainInt = ethers.parseUnits(
    inputTokenAmount.toString(),
    inputTokenInfo.decimals,
  );

  const feePaths: number[] = [];

  // Check if the pool exists for each pair of tokens in the path
  for (let i = 0; i < tokenPaths.length - 1; i++) {
    const token0 = tokenPaths[i];
    const token1 = tokenPaths[i + 1];

    const { poolAddress: dexPoolAddress, fee } = await getDEXPoolAddressForPair(
      token0,
      token1,
    );

    if (dexPoolAddress == hre.ethers.ZeroAddress) {
      throw new Error(`Pool does not exist for ${token0} and ${token1}`);
    }

    feePaths.push(fee);
  }

  // Approve the router to spend the token
  await inputTokenContract.approve(routerAddress, ethers.MaxUint256);

  const swapTxn = await routerContract.exactInput({
    path: convertToSwapPath(tokenPaths, feePaths, true),
    recipient: callerAddress,
    deadline: Math.floor(Date.now() / 1000) + deadlineInSeconds,
    amountIn: inputTokenAmountOnChainInt,
    amountOutMinimum: 0,
  });
  const swapReceipt = await swapTxn.wait();

  if (swapReceipt?.status !== 1) {
    throw new Error("Swap failed");
  }
}

/**
 * Get the StaticOracleWrapper contract
 *
 * @returns - The StaticOracleWrapper contract
 */
export async function getStaticOracleContract(): Promise<StaticOracleWrapper> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dexDeployer);

  const oracleDeployedResult = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );
  const oracleContract = await hre.ethers.getContractAt(
    "StaticOracleWrapper",
    oracleDeployedResult.address,
    signer,
  );

  return oracleContract;
}

/**
 * Get the AaveOracle contract
 *
 * @returns - The AaveOracle contract
 */
export async function getAaveOracleContract(): Promise<AaveOracle> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(lendingDeployer);

  const oracleDeployedResult = await hre.deployments.get(ORACLE_ID);
  const oracleContract = await hre.ethers.getContractAt(
    "AaveOracle",
    oracleDeployedResult.address,
    signer,
  );

  return oracleContract;
}

/**
 * Use the MockStaticOracleWrapper contract as the fallback oracle of the AaveOracle contract
 *
 * @param quoteTokenAddress - The address of the quote token
 * @param priceDecimals - The number of decimals for the price
 * @returns - The previous fallback oracle address
 */
export async function useMockStaticOracleWrapper(
  quoteTokenAddress: string,
  priceDecimals: number,
): Promise<{
  previousFallbackOracle: string;
}> {
  const { dexDeployer } = await hre.getNamedAccounts();

  const { address: mockStaticOracleWrapperAddress } = await deployContract(
    hre,
    "MockStaticOracleWrapper",
    [quoteTokenAddress, BigInt(10) ** BigInt(priceDecimals)],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "MockStaticOracleWrapper",
  );

  const aaveOracleContract = await getAaveOracleContract();

  const previousFallbackOracle = await aaveOracleContract.getFallbackOracle();

  const res = await aaveOracleContract.setFallbackOracle(
    mockStaticOracleWrapperAddress,
  );
  await res.wait();

  return {
    previousFallbackOracle,
  };
}

/**
 * Get the MockStaticOracleWrapper contract
 *
 * @returns - The MockStaticOracleWrapper contract
 */
export async function getMockStaticOracleWrapperContract(): Promise<MockStaticOracleWrapper> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dexDeployer);

  const oracleDeployedResult = await hre.deployments.get(
    "MockStaticOracleWrapper",
  );
  const oracleContract = await hre.ethers.getContractAt(
    "MockStaticOracleWrapper",
    oracleDeployedResult.address,
    signer,
  );

  return oracleContract;
}

/**
 * Set the price of the token in the MockStaticOracleWrapper contract
 *
 * @param tokenAddress - The address of the token
 * @param price - The price of the token
 */
export async function setMockStaticOracleWrapperPrice(
  tokenAddress: string,
  price: number,
): Promise<void> {
  const oracleContract = await getMockStaticOracleWrapperContract();
  const priceUnit = await oracleContract.BASE_CURRENCY_UNIT();
  const priceDecimals = getDecimals(priceUnit);
  await oracleContract.setAssetPrice(
    tokenAddress,
    ethers.parseUnits(price.toString(), priceDecimals),
  );
}

/**
 * Calculates the minimum tick value for a given tick spacing.
 *
 * @param tickSpacing The spacing between ticks.
 * @returns The minimum tick value that is a multiple of the given tick spacing.
 */
export const getMinTick = (tickSpacing: number): number =>
  Math.ceil(-887272 / tickSpacing) * tickSpacing;

/**
 * Calculates the maximum tick value for a given tick spacing.
 *
 * @param tickSpacing The spacing between ticks.
 * @returns The maximum tick value that is a multiple of the given tick spacing.
 */
export const getMaxTick = (tickSpacing: number): number =>
  Math.floor(887272 / tickSpacing) * tickSpacing;
