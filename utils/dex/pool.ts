import { BigNumber } from "@ethersproject/bignumber";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BigintIsh, Token } from "@uniswap/sdk-core";
import {
  FeeAmount,
  nearestUsableTick,
  Pool,
  Position,
  toHex,
} from "@uniswap/v3-sdk";
import {
  Addressable,
  BigNumberish,
  ContractTransactionReceipt,
  ethers,
  MaxUint256,
} from "ethers";
import hrer from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { approveTokenAllowance, fetchTokenInfo, TokenInfo } from "../token";
import {
  NONFUNGIBLE_POSITION_MANAGER_ID,
  UNISWAP_V3_FACTORY_ID,
} from "./deploy-ids";
import { encodePriceSqrtX96 } from "./utils";

export interface PoolDeploymentResult {
  poolAddress: string;
  receipt: ContractTransactionReceipt | null;
}

/**
 * Deploy a pool for the given token pair
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer's wallet signer
 * @param token0Address - The token0 address
 * @param token1Address - The token1 address
 * @param fee - The fee for the pool
 * @param reserve0 - The reserve for token0
 * @param reserve1 - The reserve for token1
 * @param gasLimit - The gas limit for the deployment
 * @returns The deployment result with the deployed contract information
 */
export async function deployPool(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  token0Address: string | Addressable,
  token1Address: string | Addressable,
  fee: BigNumberish,
  reserve0: number,
  reserve1: number,
  gasLimit: number | undefined,
): Promise<PoolDeploymentResult> {
  const token0Info = await fetchTokenInfo(hre, token0Address.toString());
  const token1Info = await fetchTokenInfo(hre, token1Address.toString());

  console.log("-----------------");
  console.log(
    `Deploying pool for pair ${token0Info.symbol}-${token1Info.symbol} with fee ${fee}`,
  );
  console.log(
    `  - ${token0Info.symbol} address  : ${token0Info.address} (decimals ${token0Info.decimals})`,
  );
  console.log(
    `  - ${token1Info.symbol} address  : ${token1Info.address} (decimals ${token1Info.decimals})`,
  );

  // Sort the pool pair by address ascendingly
  // It is required by createAndInitializePoolIfNecessary() method of NonfungiblePositionManager contract
  const sortedTokens = sortPoolPair<{
    reserve: BigNumberish;
  }>(
    token0Address.toString(),
    {
      reserve: ethers.parseUnits(reserve0.toString(), token0Info.decimals),
    },
    token1Address.toString(),
    {
      reserve: ethers.parseUnits(reserve1.toString(), token1Info.decimals),
    },
  );

  const sqrtPriceX96 = encodePriceSqrtX96({
    reserve1: sortedTokens[1].info.reserve,
    reserve0: sortedTokens[0].info.reserve,
  });

  const { address: nonfungiblePositionManagerAddress } =
    await hre.deployments.get(NONFUNGIBLE_POSITION_MANAGER_ID);

  // Create the pool and initialize it (if necessary)
  const nftPositionManagerContract = await hre.ethers.getContractAt(
    "NonfungiblePositionManager",
    nonfungiblePositionManagerAddress,
    deployer,
  );
  const initRes =
    await nftPositionManagerContract.createAndInitializePoolIfNecessary(
      sortedTokens[0].address,
      sortedTokens[1].address,
      fee,
      sqrtPriceX96.toString(),
      {
        gasLimit: gasLimit,
      },
    );
  const initReceipt = await initRes.wait();

  if (initReceipt === undefined) {
    throw new Error("initReceipt is undefined");
  }

  console.log("  - SqrtPriceX96    :", sqrtPriceX96.toString());
  console.log("  - Deployed TxHash :", initReceipt?.hash);
  console.log("  - GasUsed         :", initReceipt?.gasUsed.toString());

  const { address: factoryAddress } = await hre.deployments.get(
    UNISWAP_V3_FACTORY_ID,
  );

  // Get pool address
  const factoryContract = await hre.ethers.getContractAt(
    "UniswapV3Factory",
    factoryAddress,
    deployer,
  );
  const poolAddress = await factoryContract.getPool(
    token0Address.toString(),
    token1Address.toString(),
    fee,
  );

  console.log("  - Pool address    :", poolAddress);
  console.log("-----------------");

  return {
    poolAddress: poolAddress,
    receipt: initReceipt,
  };
}

export interface PoolData {
  tickSpacing: bigint;
  fee: bigint;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: bigint;
}

/**
 * Fetch the DEX pool data for the given pool address
 *
 * @param hre - Hardhat Runtime Environment
 * @param poolAddress - The pool address
 * @returns The pool data
 */
export async function getPoolData(
  hre: HardhatRuntimeEnvironment,
  poolAddress: string,
): Promise<PoolData> {
  // The *.sol contract will be automatically found in contracts/dex/core/UniswapV3Pool.sol
  // Use contract name to allow typechain to work properly
  const poolContract = await hre.ethers.getContractAt(
    "UniswapV3Pool", // contracts/dex/core/UniswapV3Pool.sol:UniswapV3Pool
    poolAddress,
  );
  const [tickSpacing, fee, liquidity, slot0] = await Promise.all([
    poolContract.tickSpacing(),
    poolContract.fee(),
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  return {
    tickSpacing: BigNumber.from(tickSpacing).toBigInt(),
    fee: BigNumber.from(fee).toBigInt(),
    liquidity: liquidity,
    sqrtPriceX96: BigNumber.from(slot0[0]).toBigInt(),
    tick: BigNumber.from(slot0[1]).toBigInt(),
  };
}

/**
 * Sort the pool pair by address ascendingly
 * - It is required by createAndInitializePoolIfNecessary() method of NonfungiblePositionManager contract
 *
 * @param token0Address - The token0 address
 * @param token0Info - The token0 info
 * @param token1Address - The token1 address
 * @param token1Info - The token1 info
 * @returns The sorted pool pair
 */
function sortPoolPair<T>(
  token0Address: string,
  token0Info: T,
  token1Address: string,
  token1Info: T,
): {
  address: string;
  info: T;
}[] {
  const tokens = [
    {
      address: token0Address,
      info: token0Info,
    },
    {
      address: token1Address,
      info: token1Info,
    },
  ];

  // Sort ascending by address as it is required by createAndInitializePoolIfNecessary() method
  tokens.sort((a, b) => a.address.localeCompare(b.address));
  return tokens;
}

/**
 * Calculate the position for the given pool data, token0 info, token1 info, and input token0 amount
 * - The corresponding token1 amount will be calculated automatically based on the pool data and token0 amount
 *
 * @param chainID - The chain ID
 * @param poolData - The pool data
 * @param token0Info - The token0 info
 * @param token1Info - The token1 info
 * @param inputToken0Amount - The input token0 amount
 * @returns The position
 */
export function calculatePosition(
  chainID: number,
  poolData: PoolData,
  token0Info: TokenInfo,
  token1Info: TokenInfo,
  inputToken0Amount: BigintIsh,
): Position {
  const sortedTokens = sortPoolPair<{
    detail: TokenInfo;
  }>(
    token0Info.address,
    {
      detail: token0Info,
    },
    token1Info.address,
    {
      detail: token1Info,
    },
  );

  const token0 = new Token(
    chainID,
    sortedTokens[0].address,
    sortedTokens[0].info.detail.decimals,
    sortedTokens[0].info.detail.symbol,
    sortedTokens[0].info.detail.name,
  );
  const token1 = new Token(
    chainID,
    sortedTokens[1].address,
    sortedTokens[1].info.detail.decimals,
    sortedTokens[1].info.detail.symbol,
    sortedTokens[1].info.detail.name,
  );

  const tick = Number(poolData.tick);
  const tickSpacing = Number(poolData.tickSpacing);

  const pool = new Pool(
    token0,
    token1,
    convertNumberToFeeAmount(poolData.fee),
    poolData.sqrtPriceX96.toString(),
    poolData.liquidity.toString(),
    tick,
  );

  if (sortedTokens[0].address === token0Info.address) {
    // Convert the input token0 amount to the amount in Token0 decimal
    // Example: 1 DUSD (6 decimals) => 1000000 (6 decimals)
    const inputToken0AmountInToken0 = ethers.parseUnits(
      inputToken0Amount.toString(),
      sortedTokens[0].info.detail.decimals,
    );
    return Position.fromAmount0({
      pool: pool,
      amount0: inputToken0AmountInToken0.toString(),
      // tickLower: nearestUsableTick(tick, tickSpacing) - tickSpacing * 2,
      // tickUpper: nearestUsableTick(tick, tickSpacing) + tickSpacing * 2,
      tickLower: nearestUsableTick(tick, tickSpacing) - tickSpacing * 200,
      tickUpper: nearestUsableTick(tick, tickSpacing) + tickSpacing * 200,
      useFullPrecision: true,
    });
  }

  // Convert the input token0 amount to the amount in Token1 decimal
  // Example: 1 DUSD (6 decimals) => 1000000 (6 decimals)
  const inputToken0AmountInToken1 = ethers.parseUnits(
    inputToken0Amount.toString(),
    sortedTokens[1].info.detail.decimals,
  );
  return Position.fromAmount1({
    pool: pool,
    amount1: inputToken0AmountInToken1.toString(),
    // tickLower: nearestUsableTick(tick, tickSpacing) - tickSpacing * 2,
    // tickUpper: nearestUsableTick(tick, tickSpacing) + tickSpacing * 2,
    tickLower: nearestUsableTick(tick, tickSpacing) - tickSpacing * 200,
    tickUpper: nearestUsableTick(tick, tickSpacing) + tickSpacing * 200,
  });
}

/**
 * Convert the number to FeeAmount
 * - Throw an error if the fee amount is invalid
 *
 * @param fee - The fee amount in bigint
 * @returns The FeeAmount
 */
function convertNumberToFeeAmount(fee: bigint): FeeAmount {
  switch (fee.toString()) {
    case "100":
      return FeeAmount.LOWEST;
    case "500":
      return FeeAmount.LOW;
    case "3000":
      return FeeAmount.MEDIUM;
    case "10000":
      return FeeAmount.HIGH;
    default:
      throw new Error(`Invalid fee amount: ${fee}`);
  }
}

export interface AddPoolLiquidityResult {
  position: Position;
  token0ApproveReceipt: ContractTransactionReceipt | null;
  token1ApproveReceipt: ContractTransactionReceipt | null;
  addLiquidityReceipt: ContractTransactionReceipt | null;
}

/**
 * Add liquidity to the pool with the given token0 amount
 * - The corresponding token1 amount will be calculated automatically based on the pool data and token0 amount
 *
 * @param hre - Hardhat Runtime Environment
 * @param poolAddress - The pool address
 * @param token0Info - The token0 info
 * @param token1Info - The token1 info
 * @param inputToken0Amount - The input token0 amount (for adding liquidity) (1 DUSD, 1 USDT, etc.)
 * @param liquidityAdder - The liquidity adder's wallet signer
 * @param gasLimit - The gas limit for the deployment
 * @param deadlineInSeconds - The deadline for the adding liquidity transaction (in seconds)
 * @returns The transaction receipts
 */
export async function addPoolLiquidity(
  hre: HardhatRuntimeEnvironment,
  poolAddress: string,
  token0Info: TokenInfo,
  token1Info: TokenInfo,
  inputToken0Amount: number,
  liquidityAdder: HardhatEthersSigner,
  gasLimit: number | undefined,
  deadlineInSeconds: number,
): Promise<AddPoolLiquidityResult> {
  // Calculate the position for adding liquidity
  const chainID = parseInt(await hre.getChainId());
  const poolData = await getPoolData(hre, poolAddress);
  const position = calculatePosition(
    chainID,
    poolData,
    token0Info,
    token1Info,
    inputToken0Amount.toString(),
  );

  const { address: nonfungiblePositionManagerAddress } =
    await hre.deployments.get(NONFUNGIBLE_POSITION_MANAGER_ID);

  // The *.sol contract will be automatically found in contracts/dex/core/NonfungiblePositionManager.sol:NonfungiblePositionManager
  const nftPositionManagerContract = await hre.ethers.getContractAt(
    "NonfungiblePositionManager",
    nonfungiblePositionManagerAddress,
    liquidityAdder,
  );

  const maxAllowance = MaxUint256.toString();

  /**
   * We need to approve the token allowance for the NonfungiblePositionManager contract when adding liquidity
   * as the contract will transfer the token0 and token1 amounts from the liquidity adder's wallet
   * to the pool contract when adding liquidity
   */
  console.log("-----------------");
  console.log(
    `Approving token allowance for token ${token0Info.symbol} (decimals ${token0Info.decimals})`,
  );
  const token0ApproveReceipt = await approveTokenAllowance(
    hre,
    token0Info.address,
    liquidityAdder,
    nonfungiblePositionManagerAddress,
    maxAllowance,
  );
  console.log("  - TxHash         :", token0ApproveReceipt?.hash);
  console.log("  - GasUsed        :", token0ApproveReceipt?.gasUsed.toString());
  console.log("  - MaxAllowance   :", maxAllowance);
  console.log("  - TokenAddress   :", token0Info.address.toString());
  console.log("  - LiquidityAdder :", liquidityAdder.address.toString());
  console.log("  - Spender        :", nonfungiblePositionManagerAddress);

  console.log("-----------------");
  console.log(
    `Approving token allowance for token ${token1Info.symbol} (decimals ${token1Info.decimals})`,
  );
  const token1ApproveReceipt = await approveTokenAllowance(
    hre,
    token1Info.address,
    liquidityAdder,
    nonfungiblePositionManagerAddress,
    maxAllowance,
  );
  console.log("  - TxHash         :", token1ApproveReceipt?.hash);
  console.log("  - GasUsed        :", token1ApproveReceipt?.gasUsed.toString());
  console.log("  - MaxAllowance   :", maxAllowance);
  console.log("  - TokenAddress   :", token1Info.address.toString());
  console.log("  - LiquidityAdder :", liquidityAdder.address.toString());
  console.log("  - Spender        :", nonfungiblePositionManagerAddress);

  // Add liquidity to the pool
  // - Reference: https://github.com/Uniswap/v3-sdk/blob/e10fb50efcbdefe7ed9b18962ce4cad51cf30d72/src/nonfungiblePositionManager.ts#L232-L246
  const params = {
    token0: position.pool.token0.address,
    token1: position.pool.token1.address,
    fee: position.pool.fee,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    amount0Desired: toHex(position.mintAmounts.amount0),
    amount1Desired: toHex(position.mintAmounts.amount1),
    amount0Min: toHex(0),
    amount1Min: toHex(0),
    recipient: liquidityAdder.address,
    deadline: toHex(Math.floor(Date.now() / 1000) + deadlineInSeconds),
  };

  console.log("-----------------");
  console.log(`Adding liquidity to the pool ${poolAddress}`);
  console.log("  - Token0 address :", params.token0);
  console.log("  - Token1 address :", params.token1);
  console.log("  - Fee            :", params.fee);
  console.log("  - TickLower      :", params.tickLower);
  console.log("  - TickUpper      :", params.tickUpper);
  console.log(
    "  - Amount0Desired :",
    BigNumber.from(params.amount0Desired).toString(),
  );
  console.log(
    "  - Amount1Desired :",
    BigNumber.from(params.amount1Desired).toString(),
  );
  console.log(
    "  - Amount0Min     :",
    BigNumber.from(params.amount0Min).toString(),
  );
  console.log(
    "  - Amount1Min     :",
    BigNumber.from(params.amount1Min).toString(),
  );
  console.log("  - Recipient      :", params.recipient);
  console.log(
    "  - Deadline       :",
    BigNumber.from(params.deadline).toString(),
  );
  const res = await nftPositionManagerContract.mint(params, {
    gasLimit: gasLimit,
  });
  const receipt = await res.wait();
  console.log("  - TxHash         :", receipt?.hash);
  console.log("  - GasUsed        :", receipt?.gasUsed.toString());
  console.log("-----------------");

  return {
    position: position,
    token0ApproveReceipt: token0ApproveReceipt,
    token1ApproveReceipt: token1ApproveReceipt,
    addLiquidityReceipt: receipt,
  };
}

export interface DeployAndInitializePoolResult {
  poolDeploymentResult: PoolDeploymentResult;
  addPoolLiquidityResult: AddPoolLiquidityResult;
}

/**
 * Deploy and initialize the pool for the given token pair
 *
 * @param hre - Hardhat Runtime Environment
 * @param token0Address - The token0 address
 * @param token1Address - The token1 address
 * @param fee - The fee for the pool
 * @param initPrice - The initial price for the pool (used for creating the pool)
 * @param initPrice.amount0 - The amount0 for the initial price
 * @param initPrice.amount1 - The amount1 for the initial price
 * @param inputToken0Amount - The input token0 amount (used for adding liquidity to the pool)
 * @param deployer - The deployer's wallet signer
 * @param liquidityAdder - The liquidity adder's wallet signer
 * @param gasLimits - The gas limits for the deployment
 * @param gasLimits.deployPool - The gas limit for deploying the pool
 * @param gasLimits.addLiquidity - The gas limit for adding liquidity to the pool
 * @param deadlineInSeconds - The deadline for the adding liquidity transaction (in seconds)
 * @returns The deployment and initialization result
 */
export async function deployAndInitializePool(
  hre: HardhatRuntimeEnvironment,
  token0Address: string | Addressable,
  token1Address: string | Addressable,
  fee: FeeAmount,
  initPrice: {
    amount0: number;
    amount1: number;
  },
  inputToken0Amount: number,
  deployer: HardhatEthersSigner,
  liquidityAdder: HardhatEthersSigner,
  gasLimits: {
    deployPool: number | undefined;
    addLiquidity: number | undefined;
  },
  deadlineInSeconds: number,
): Promise<DeployAndInitializePoolResult> {
  // Print a space line to separate the output
  console.log("");

  // Deploy the pool for Token0-Token1 with the fee schema
  const poolDeployResult = await deployPool(
    hre,
    deployer,
    token0Address,
    token1Address,
    fee,
    initPrice.amount0,
    initPrice.amount1,
    gasLimits.deployPool,
  );

  const token0Info = await fetchTokenInfo(hre, token0Address.toString());
  const token1Info = await fetchTokenInfo(hre, token1Address.toString());

  // Add liquidity to the pool
  const addLiquidityResult = await addPoolLiquidity(
    hre,
    poolDeployResult.poolAddress,
    token0Info,
    token1Info,
    inputToken0Amount,
    liquidityAdder,
    gasLimits.addLiquidity,
    deadlineInSeconds,
  );

  return {
    poolDeploymentResult: poolDeployResult,
    addPoolLiquidityResult: addLiquidityResult,
  };
}

/**
 * Check the pool data after initialization
 *
 * @param hre - Hardhat Runtime Environment
 * @param initPoolResult - The pool deployment and initialization result
 */
export async function checkPoolData(
  hre: HardhatRuntimeEnvironment,
  initPoolResult: DeployAndInitializePoolResult,
): Promise<void> {
  // Check pool liquidity
  const pooAddress = initPoolResult.poolDeploymentResult.poolAddress;
  console.log("-----------------");
  console.log(`Checking pool data for pool ${pooAddress} after initialization`);
  const poolData = await getPoolData(hre, pooAddress);
  console.log(`  - Fee          : ${poolData.fee}`);
  console.log(`  - Liquidity    : ${poolData.liquidity}`);
  console.log(`  - Tick         : ${poolData.tick}`);
  console.log(`  - TickSpacing  : ${poolData.tickSpacing}`);
  console.log(`  - SqrtPriceX96 : ${poolData.sqrtPriceX96}`);
  console.log(`-----------------`);
}

/**
 * Get the address of a DEX pool
 *
 * @param token0Address - Address of the first token
 * @param token1Address - Address of the second token
 * @param fee - The fee tier for the pool
 * @returns - The address of the DEX pool
 */
export async function getDEXPoolAddress(
  token0Address: string,
  token1Address: string,
  fee: FeeAmount,
): Promise<string> {
  const { address: swapFactoryAddress } = await hrer.deployments.get(
    UNISWAP_V3_FACTORY_ID,
  );
  const swapFactory = await hrer.ethers.getContractAt(
    "UniswapV3Factory",
    swapFactoryAddress,
  );
  const poolAddress = await swapFactory.getPool(
    token0Address,
    token1Address,
    fee,
  );
  return poolAddress;
}

/**
 * Check if a DEX pool exists
 *
 * @param token0Address - Address of the first token
 * @param token1Address - Address of the second token
 * @param fee - The fee tier for the pool
 * @returns - Whether the pool exists
 */
export async function isDEXPoolExisting(
  token0Address: string,
  token1Address: string,
  fee: FeeAmount,
): Promise<boolean> {
  const poolAddress = await getDEXPoolAddress(
    token0Address,
    token1Address,
    fee,
  );
  return poolAddress !== ethers.ZeroAddress;
}

/**
 * Get the DEX pool address for the given token pair
 * - It will try to find the DEX pool address with the fee schema from high to lowest
 * - If the pool does not exist, it will return ZeroAddress in the pool address
 *
 * @param token0Address - The token0 address
 * @param token1Address - The token1 address
 * @returns The DEX pool address and the fee (returns ZeroAddress if the pool does not exist)
 */
export async function getDEXPoolAddressForPair(
  token0Address: string,
  token1Address: string,
): Promise<{
  poolAddress: string;
  fee: FeeAmount;
}> {
  const feeSchemas = [
    FeeAmount.HIGH,
    FeeAmount.MEDIUM,
    FeeAmount.LOW,
    FeeAmount.LOWEST,
  ];

  for (const fee of feeSchemas) {
    const poolAddress = await getDEXPoolAddress(
      token0Address,
      token1Address,
      fee,
    );

    if (poolAddress !== ethers.ZeroAddress) {
      return {
        poolAddress: poolAddress,
        fee: fee,
      };
    }
  }
  return {
    poolAddress: ethers.ZeroAddress,
    fee: FeeAmount.LOW,
  };
}

/**
 * Check each pair of tokens in the path to make sure that the swap path exists
 *
 * @param tokensPath - The tokens path (e.g., ETH -> USDC -> DAI means [ETH, USDC, DAI])
 * @param feesPath - The fees path (e.g., ETH -> USDC -> DAI means [3000, 500] means 0.3% fee for ETH -> USDC and 0.5% fee for USDC -> DAI)
 */
export async function checkIfSwapPathExists(
  tokensPath: string[],
  feesPath: FeeAmount[],
): Promise<void> {
  if (tokensPath.length < 2) {
    throw new Error(`Invalid tokens path: ${tokensPath}`);
  }

  if (feesPath.length !== tokensPath.length - 1) {
    throw new Error(
      `Invalid fees path for tokens path: ${tokensPath} - ${feesPath}`,
    );
  }

  for (let i = 0; i < tokensPath.length - 1; i++) {
    const token0Address = tokensPath[i];
    const token1Address = tokensPath[i + 1];
    const fee = feesPath[i];

    const poolAddress = await getDEXPoolAddress(
      token0Address,
      token1Address,
      fee,
    );

    if (poolAddress === ethers.ZeroAddress) {
      const token0Info = await fetchTokenInfo(hrer, token0Address);
      const token1Info = await fetchTokenInfo(hrer, token1Address);

      throw new Error(
        `Swap path with fee ${fee} does not exist for pair: token1=${token0Info.symbol} (${token0Address}) - token2=${token1Info.symbol} (${token1Address})`,
      );
    }
  }
}
