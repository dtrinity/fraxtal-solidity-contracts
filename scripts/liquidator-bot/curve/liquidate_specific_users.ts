import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { getUserHealthFactor } from "../../../utils/lending/account";
import { runBotBatch } from "../../../utils/liquidator-bot/curve/run";
import {
  getFlashLoanLiquidatorBot,
  getFlashMintLiquidatorBot,
} from "../../../utils/liquidator-bot/curve/utils";
import { printLog } from "../../../utils/liquidator-bot/shared/log";

/**
 * This script liquidates specific users by their addresses using Curve pools.
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/liquidator-bot/curve/liquidate_specific_users.ts
 */
async function main(): Promise<void> {
  const userAddresses: string[] = [
    // Specify the user addresses to liquidate
    // "0xD2BEd8aA25D8EF7E85E5134f51a3C6Ed61B07A27",
    // "0x6e868846b2182235c16fd122fcd44739e55a58e4",
    // "0xf82c3640277198d40f94615a51b473121036a898",
    "0x2f54f55f498e8db00e35d6a0563c8cb682567e1b",
  ];

  const index = 1;
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();
  const { contract: flashMintLiquidatorBotContract } =
    await getFlashMintLiquidatorBot(liquidatorBotDeployer);
  const { contract: flashLoanliquidatorBotContract } =
    await getFlashLoanLiquidatorBot(liquidatorBotDeployer);

  printLog(index, "Printing health factors of the users to liquidate");

  for (const userAddress of userAddresses) {
    const healthFactor = await getUserHealthFactor(userAddress);
    printLog(index, `User: ${userAddress}, Health Factor: ${healthFactor}`);
  }
  printLog(index, "");

  const config = await getConfig(hre);

  if (!config.liquidatorBotCurve) {
    throw new Error("Liquidator bot Curve config is not set");
  }

  printLog(index, `Liquidating ${userAddresses.length} users`);
  await runBotBatch(
    index,
    userAddresses,
    liquidatorBotDeployer,
    flashMintLiquidatorBotContract,
    flashLoanliquidatorBotContract,
    config.liquidatorBotCurve.healthFactorBatchSize,
    config.liquidatorBotCurve.healthFactorThreshold,
    config.liquidatorBotCurve.profitableThresholdInUSD,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
