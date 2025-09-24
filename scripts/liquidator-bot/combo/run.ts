import { runCurveBot } from "../../../utils/liquidator-bot/curve/run";
import { runOdosBot } from "../../../utils/liquidator-bot/odos/run";
import { printLog } from "../../../utils/liquidator-bot/shared/log";

/**
 * Runs the Odos bot up to maxOdosFailureCount times, waiting waitSecondsBetweenTrials seconds between each trial
 *
 * @param index - The index of the trial
 * @param maxOdosFailureCount - The maximum number of failures for Odos bot
 * @param waitSecondsBetweenTrials - The number of seconds to wait between each trial
 * @returns true if the Odos bot succeeds, false otherwise
 */
async function runOdosTrials(index: number, maxOdosFailureCount: number, waitSecondsBetweenTrials: number): Promise<boolean> {
  for (let i = 0; i < maxOdosFailureCount; i++) {
    printLog(index, `Running Odos trial ${i + 1}`);

    try {
      await runOdosBot(index);
      return true;
    } catch (error: any) {
      printLog(index, `Odos trial ${i + 1} failed`);
      console.error(error);
      printLog(index, `Waiting for ${waitSecondsBetweenTrials} seconds before retrying the Odos bot`);
      await new Promise((resolve) => setTimeout(resolve, waitSecondsBetweenTrials * 1000));
    }
  }
  return false;
}

/**
 * Runs the Curve bot up to maxCurveFailureCount times, waiting waitSecondsBetweenTrials seconds between each trial
 *
 * @param index - The index of the trial
 * @param maxCurveFailureCount - The maximum number of failures for Curve bot
 * @param waitSecondsBetweenTrials - The number of seconds to wait between each trial
 * @returns true if the Curve bot succeeds, false otherwise
 */
async function runCurveTrial(index: number, maxCurveFailureCount: number, waitSecondsBetweenTrials: number): Promise<boolean> {
  for (let i = 0; i < maxCurveFailureCount; i++) {
    printLog(index, `Running Curve trial ${i + 1}`);

    try {
      await runCurveBot(index);
      return true;
    } catch (error: any) {
      printLog(index, `Curve trial ${i + 1} failed`);
      console.error(error);
      printLog(index, `Waiting for ${waitSecondsBetweenTrials} seconds before retrying the Curve bot`);
      await new Promise((resolve) => setTimeout(resolve, waitSecondsBetweenTrials * 1000));
    }
  }
  return false;
}

/**
 * The entry point for the combo liquidator bot that tries Odos first, then falls back to Curve
 */
async function main(): Promise<void> {
  let index = 1;
  const maxOdosFailureCount = 5;
  const maxCurveFailureCount = 3;

  while (true) {
    printLog(index, `Running combo liquidator bot`);

    try {
      // First, it tries Odos bot for multiple times
      const odosSuccess = await runOdosTrials(index, maxOdosFailureCount, 2);

      // If Odos bot tries failed, it falls back to Curve bot (with multiple tries)
      if (!odosSuccess) {
        printLog(index, `Odos bot failed, falling back to Curve bot`);
        await runCurveTrial(index, maxCurveFailureCount, 2);
      }
    } catch (error: any) {
      printLog(index, `Error running combo liquidator bot`);
      console.error(error);
    }

    printLog(index, `Waiting for 5 seconds before running the combo liquidator bot again`);
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
