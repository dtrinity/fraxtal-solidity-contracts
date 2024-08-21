import { FeeAmount } from "@uniswap/v3-sdk";
import hre from "hardhat";

import { deployAndInitializePool } from "../../../utils/dex/pool";

/**
 * Deploy and initialize the DEX pools
 *
 * @param poolConfigs - The pool configurations
 */
export async function deployPools(
  poolConfigs: {
    token0Address: string;
    token1Address: string;
    fee: FeeAmount;
    initPrice: { amount0: number; amount1: number };
    inputToken0Amount: number;
    gasLimits: { deployPool: number; addLiquidity: number };
    deadlineInSeconds: number;
  }[],
): Promise<void> {
  const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

  for (const pool of poolConfigs) {
    await deployAndInitializePool(
      hre,
      pool.token0Address,
      pool.token1Address,
      pool.fee,
      pool.initPrice,
      pool.inputToken0Amount,
      await hre.ethers.getSigner(dexDeployer),
      await hre.ethers.getSigner(dexLiquidityAdder),
      pool.gasLimits,
      pool.deadlineInSeconds,
    );
  }
}
