import { FeeAmount } from "@uniswap/v3-sdk";
import hre from "hardhat";

import { UNISWAP_V3_FACTORY_ID } from "../../../utils/dex/deploy-ids";
import { addPoolLiquidity } from "../../../utils/dex/pool";
import { fetchTokenInfo } from "../../../utils/token";
import { getTokenContractForAddress } from "../../../utils/utils";

/**
 * Add liquidity to the DEX pools
 *
 * @param configs - The pool configurations
 */
export async function addLiquidityToPools(
  configs: {
    token0Address: string;
    token1Address: string;
    fee: FeeAmount;
    inputToken0Amount: number;
    gasLimits: { deployPool: number; addLiquidity: number };
    deadlineInSeconds: number;
  }[],
): Promise<void> {
  const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

  const { address: factoryAddress } = await hre.deployments.get(UNISWAP_V3_FACTORY_ID);

  // Get pool address
  const factoryContract = await hre.ethers.getContractAt("UniswapV3Factory", factoryAddress, await hre.ethers.getSigner(dexDeployer));

  const liquidityAdder = await hre.ethers.getSigner(dexLiquidityAdder);

  for (const config of configs) {
    const poolAddress = await factoryContract.getPool(config.token0Address, config.token1Address, config.fee);

    const token0Info = await fetchTokenInfo(hre, config.token0Address);
    const token1Info = await fetchTokenInfo(hre, config.token1Address);

    const { contract: token0Contract } = await getTokenContractForAddress(dexLiquidityAdder, token0Info.address);

    const token0BalanceRaw = Number(await token0Contract.balanceOf(dexLiquidityAdder));
    const token0Balance = token0BalanceRaw / 10 ** token0Info.decimals;

    if (token0Balance < config.inputToken0Amount) {
      throw new Error(
        `Insufficient balance of ${token0Info.symbol} to add liquidity. Required: ${config.inputToken0Amount}, available: ${token0Balance}`,
      );
    }

    // Add liquidity to the pool
    await addPoolLiquidity(
      hre,
      poolAddress,
      token0Info,
      token1Info,
      config.inputToken0Amount,
      liquidityAdder,
      config.gasLimits.addLiquidity,
      config.deadlineInSeconds,
    );
  }
}
