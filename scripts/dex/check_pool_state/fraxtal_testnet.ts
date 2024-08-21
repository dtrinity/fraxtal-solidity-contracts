import { FeeAmount } from "@uniswap/v3-sdk";
import hre from "hardhat";

import { TOKEN_INFO } from "../../../config/networks/fraxtal_testnet";
import { UNISWAP_V3_FACTORY_ID } from "../../../utils/dex/deploy-ids";
import { calculatePosition, getPoolData } from "../../../utils/dex/pool";
import { fetchTokenInfo } from "../../../utils/token";

/**
 * Check the state of the given DEX pools on Fraxtal testnet
 */
async function main(): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();

  const { address: factoryAddress } = await hre.deployments.get(
    UNISWAP_V3_FACTORY_ID,
  );

  // Get pool address
  const factoryContract = await hre.ethers.getContractAt(
    "UniswapV3Factory",
    factoryAddress,
    await hre.ethers.getSigner(dexDeployer),
  );

  const chainID = Number(await hre.getChainId());

  const pools = [
    {
      token0Address: TOKEN_INFO.wfrxETH.address,
      token1Address: TOKEN_INFO.dUSD.address,
      fee: FeeAmount.MEDIUM,
      testInputAmount: 0.000001,
    },
  ];

  for (const pool of pools) {
    const poolAddress = await factoryContract.getPool(
      pool.token0Address,
      pool.token1Address,
      pool.fee,
    );

    console.log(`-------------------------------------`);
    console.log(`Pool address   : ${poolAddress}`);
    console.log(`Token0 address : ${pool.token0Address}`);
    console.log(`Token1 address : ${pool.token1Address}`);
    console.log(`Fee            : ${pool.fee}`);
    console.log(`===============`);

    const data = await getPoolData(hre, poolAddress);
    console.log(`sqrtPriceX96`, data.sqrtPriceX96);
    console.log(`liquidity`, data.liquidity);
    console.log(`tick`, data.tick);

    const token0Info = await fetchTokenInfo(hre, pool.token0Address);
    const token1Info = await fetchTokenInfo(hre, pool.token1Address);

    const position = calculatePosition(
      chainID,
      data,
      token0Info,
      token1Info,
      pool.testInputAmount,
    );
    console.log(`===============`);
    console.log(
      `Position amount0.address : ${position.amount0.currency.address}`,
    );
    console.log(`Position amount0.amount  : ${position.amount0.toExact()}`);
    console.log(
      `Position amount1.address : ${position.amount1.currency.address}`,
    );
    console.log(`Position amount1.amount  : ${position.amount1.toExact()}`);
    console.log(`-------------------------------------`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
