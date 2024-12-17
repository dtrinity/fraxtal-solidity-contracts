import hre from "hardhat";

import { getUserHealthFactor } from "../../utils/lending/account";
import { printLog } from "../../utils/liquidator-bot/log";
import { runBotBatch } from "../../utils/liquidator-bot/run";
import {
  getFlashLoanLiquidatorBot,
  getFlashMintLiquidatorBot,
} from "../../utils/liquidator-bot/utils";

/**
 * This script liquidates specific users by their addresses.
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/liquidator-bot/liquidate_specific_users.ts
 */
async function main(): Promise<void> {
  const userAddresses: string[] = [
    // Specify the user addresses to liquidate
    // "0xD4d47CA3e1a9dE2e4A7f840d635eD67D10aca1a5",
    "0x5b630326b5bc651418911a5e4777270f73d1d812",
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

  printLog(index, `Liquidating ${userAddresses.length} users`);
  await runBotBatch(
    index,
    userAddresses,
    liquidatorBotDeployer,
    flashMintLiquidatorBotContract,
    flashLoanliquidatorBotContract,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
