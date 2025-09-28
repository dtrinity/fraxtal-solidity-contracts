import { ethers } from "ethers";

import { getTokenContractForAddress } from "../../utils/utils";

/**
 * Create a Curve pool and add liquidity
 *
 * @param callerAddress - The address of the caller
 * @param token0Address - The address of the first token
 * @param token1Address - The address of the second token
 * @param token0Amount - The amount of the first token
 * @param poolName - The name of the pool
 * @param poolSymbol - The symbol of the pool
 * @param initialPrice - The initial price of the pool
 * @param curve - The Curve instance
 * @param A - The A parameter
 * @param gamma - The gamma parameter
 * @param midFee - The mid fee parameter
 * @param outFee - The out fee parameter
 * @param allowedExtraProfit - The allowed extra profit parameter
 * @param feeGamma - The fee gamma parameter
 * @param adjustmentStep - The adjustment step parameter
 * @param maHalfTime - The moving average half time parameter
 * @returns The pool address, gauge address, and underlying balances
 */
export async function createCurvePoolAddLiquidity(
  callerAddress: string,
  token0Address: string,
  token1Address: string,
  token0Amount: number,
  poolName: string,
  poolSymbol: string,
  initialPrice: number,
  curve: any,
  A: number = 400000,
  gamma: number = 0.0000725,
  midFee: number = 0.25, // 0.25%
  outFee: number = 0.45, // 0.45%
  allowedExtraProfit: number = 0.000002,
  feeGamma: number = 0.00023,
  adjustmentStep: number = 0.000146,
  maHalfTime: number = 600,
): Promise<{
  poolAddress: string;
  gaugeAddress: string;
  underlyingBalances: string[];
}> {
  const { contract: token0Contract } = await getTokenContractForAddress(callerAddress, token0Address);
  const { contract: token1Contract } = await getTokenContractForAddress(callerAddress, token1Address);

  const coins = [token0Address, token1Address];

  // Deploy pool through factory
  const deployPoolTx = await curve.cryptoFactory.deployPool(
    poolName,
    poolSymbol,
    coins,
    A,
    gamma,
    midFee,
    outFee,
    allowedExtraProfit,
    feeGamma,
    adjustmentStep,
    maHalfTime,
    initialPrice,
  );

  const poolAddress = await curve.cryptoFactory.getDeployedPoolAddress(deployPoolTx);
  const deployGaugeTx = await curve.cryptoFactory.deployGauge(poolAddress);
  const gaugeAddress = await curve.factory.getDeployedGaugeAddress(deployGaugeTx);

  // Add liquidity
  await token0Contract.approve(poolAddress, ethers.MaxUint256);
  await token1Contract.approve(poolAddress, ethers.MaxUint256);
  const poolId = await curve.cryptoFactory.fetchRecentlyDeployedPool(poolAddress);
  const pool = curve.getPool(poolId);
  const amounts = await pool.cryptoSeedAmounts(token0Amount); // Initial amounts for crypto pools must have the ratio corresponding to initialPrice
  await pool.depositAndStake(amounts);
  const underlyingBalances = await pool.stats.underlyingBalances();

  return {
    poolAddress,
    gaugeAddress,
    underlyingBalances,
  };
}
