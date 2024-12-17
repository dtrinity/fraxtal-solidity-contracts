import { BigNumber } from "@ethersproject/bignumber";
import hre from "hardhat";

import { QUOTER_V2_ID } from "../../utils/dex/deploy-ids";
import { getSwapPath } from "../../utils/liquidator-bot/utils";
import { fetchTokenInfo } from "../../utils/token";

/**
 * Quote the swap of a pair of tokens, given the expected output amount.
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/dex/quote_swap.ts
 */
async function main(): Promise<void> {
  const quoterV2Deployment = await hre.deployments.get(QUOTER_V2_ID);
  const quoterV2Contract = await hre.ethers.getContractAt(
    "QuoterV2",
    quoterV2Deployment.address,
  );

  const inputTokenInfo = await fetchTokenInfo(
    hre,
    "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
  );
  const outputTokenInfo = await fetchTokenInfo(
    hre,
    "0x05A09C8BF515D0035e1Af22b24487928913475Bd",
  );

  const swapPath = await getSwapPath(inputTokenInfo, outputTokenInfo, false);

  const { amountIn, gasEstimate } =
    await quoterV2Contract.quoteExactOutput.staticCall(
      swapPath,
      BigNumber.from("1499437008054281023").toBigInt(),
    );

  console.log("amountIn", amountIn);
  console.log("gasEstimate", gasEstimate);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
