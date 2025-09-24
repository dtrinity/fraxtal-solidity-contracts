import { FeeAmount } from "@uniswap/v3-sdk";

import { TOKEN_INFO } from "../../../config/networks/fraxtal_testnet";
import { executeSwap } from "./utils";

/**
 * Add liquidity to the DEX pools on the Fraxtal testnet
 */
async function main(): Promise<void> {
  await executeSwap(FeeAmount.MEDIUM, TOKEN_INFO.wfrxETH.address, TOKEN_INFO.dUSD.address, 0.000001, 60);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
