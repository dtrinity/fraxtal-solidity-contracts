import { printLog } from "../../utils/liquidator-bot/log";
import { runBot } from "../../utils/liquidator-bot/run";

/**
 * The entry point for the liquidator bot
 */
async function main(): Promise<void> {
  let index = 1;

  while (true) {
    try {
      await runBot(index);
    } catch (error: any) {
      // If error includes `No defined pools`, we can safely ignore it
      if (error.message.includes("No defined pools")) {
        printLog(index, `No defined pools, skipping`);
      } else {
        console.error(error);
      }
    }

    console.log(``);
    // Wait for 5 seconds before running the bot again
    await new Promise((resolve) => setTimeout(resolve, 5000));
    index++;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
