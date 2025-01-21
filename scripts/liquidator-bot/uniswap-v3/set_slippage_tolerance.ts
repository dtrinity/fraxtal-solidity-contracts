import hre from "hardhat";

import { getFlashLoanLiquidatorBot } from "../../../utils/liquidator-bot/uniswap-v3/utils";

/**
 * Set the slippage tolerance for the liquidator bot
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/liquidator-bot/uniswap-v3/set_slippage_tolerance.ts
 */
async function main(): Promise<void> {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  // console.log("Setting slippage tolerance for FlashMintLiquidatorBot");
  // const { contract: flashMintLiquidatorBotContract } =
  //   await getFlashMintLiquidatorBot(liquidatorBotDeployer);
  // await flashMintLiquidatorBotContract.setSlippageTolerance(500);

  console.log("Setting slippage tolerance for FlashLoanLiquidatorBot");
  const { contract: flashLoanliquidatorBotContract } =
    await getFlashLoanLiquidatorBot(liquidatorBotDeployer);
  const res = await flashLoanliquidatorBotContract.setSlippageTolerance(500); // 5% in bps
  await res.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
