import { FeeAmount } from "@uniswap/v3-sdk";

import { TOKEN_INFO } from "../../../config/networks/fraxtal_testnet";
import { deployPools } from "./utils";

/**
 * Initialize the DEX pools on the Fraxtal testnet
 */
async function main(): Promise<void> {
  const initialPools = [
    {
      token0Address: TOKEN_INFO.wfrxETH.address,
      token1Address: TOKEN_INFO.dUSD.address,
      fee: FeeAmount.MEDIUM, // Fee 5 bps
      initPrice: {
        // Initial price ratio
        amount0: 1,
        amount1: 3800,
      },
      inputToken0Amount: 0.0005, // Initial token0 amount for adding liquidity
      gasLimits: {
        // Gas limit for the deployment and initialization
        deployPool: 5000000,
        addLiquidity: 1000000,
      },
      deadlineInSeconds: 600000, // Deadline in seconds
    },
    {
      token0Address: TOKEN_INFO.FXS.address,
      token1Address: TOKEN_INFO.dUSD.address,
      fee: FeeAmount.MEDIUM, // Fee 5 bps
      initPrice: {
        // Initial price ratio
        amount0: 1,
        amount1: 4,
      },
      inputToken0Amount: 1, // Initial token0 amount for adding liquidity
      gasLimits: {
        // Gas limit for the deployment and initialization
        deployPool: 5000000,
        addLiquidity: 1000000,
      },
      deadlineInSeconds: 600000, // Deadline in seconds
    },
  ];

  await deployPools(initialPools);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
