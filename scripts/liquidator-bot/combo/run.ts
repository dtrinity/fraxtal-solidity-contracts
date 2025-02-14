import { runCurveBot } from "../../../utils/liquidator-bot/curve/run";
import { runOdosBot } from "../../../utils/liquidator-bot/odos/run";
import { printLog } from "../../../utils/liquidator-bot/shared/log";

/**
 * The entry point for the combo liquidator bot that tries Odos first, then falls back to Curve
 */
async function main(): Promise<void> {
  let index = 1;
  let odosFailureCount = 0;
  const maxOdosFailureCount = 3;

  while (true) {
    printLog(index, `Running combo liquidator bot`);

    try {
      if (odosFailureCount < maxOdosFailureCount) {
        await runOdosBot(index);
        // Reset failure count on success
        odosFailureCount = 0;
      } else {
        await runCurveBot(index);
      }
    } catch (error: any) {
      // If error includes `No defined pools`, we can safely ignore it
      if (error.message.includes("No defined pools")) {
        printLog(index, `No defined pools, skipping`);
      } else {
        console.error(error);

        if (odosFailureCount < maxOdosFailureCount) {
          odosFailureCount++;
          printLog(
            index,
            `Odos failure count: ${odosFailureCount} of ${maxOdosFailureCount}`,
          );
        }
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
