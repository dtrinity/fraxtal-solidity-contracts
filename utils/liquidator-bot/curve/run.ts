import { BigNumber } from "@ethersproject/bignumber";
import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";
import { ethers } from "ethers";
import hre, { getNamedAccounts } from "hardhat";

import { getConfig } from "../../../config/config";
import {
  FlashLoanLiquidatorAaveBorrowRepayCurve,
  FlashMintLiquidatorAaveBorrowRepayCurve,
} from "../../../typechain-types";
import { STATE_DIR_PATH, USER_STATE_DIR_NAME } from "../../constants";
import { getUserHealthFactor } from "../../lending/account";
import {
  batchProcessing,
  saveToFile,
  ShortTermIgnoreMemory,
  splitToBatches,
} from "../../utils";
import { NotProfitableLiquidationError } from "../shared/errors";
import { printLog } from "../shared/log";
import { UserStateLog } from "../shared/types";
import { getLiquidationProfitInUSD } from "../shared/utils";
import {
  getCurveFlashLoanLiquidatorBot,
  getCurveFlashMintLiquidatorBot,
  performCurveLiquidationDefault,
} from "./utils";
import {
  getAllLendingUserAddresses,
  getUserLiquidationParams,
} from "./utils.run";

// Load environment variables
dotenv.config();

// Cache the Slack client
let slackInfo: { client: WebClient; channel: string } | undefined;

/**
 * Get the Slack client
 *
 * @returns - The Slack client
 */
export async function getSlackClient(): Promise<{
  client: WebClient;
  channel: string;
}> {
  if (slackInfo) {
    return slackInfo;
  }

  const SLACK_TOKEN = process.env.LIQUIDATOR_BOT_SLACK_BOT_TOKEN;
  const SLACK_CHANNEL = process.env.LIQUIDATOR_BOT_SLACK_CHANNEL_ID;

  if (!SLACK_TOKEN || !SLACK_CHANNEL) {
    throw new Error(
      "LIQUIDATOR_BOT_SLACK_BOT_TOKEN and LIQUIDATOR_BOT_SLACK_CHANNEL_ID must be set in environment variables",
    );
  }

  const client = new WebClient(SLACK_TOKEN);

  return { client, channel: SLACK_CHANNEL };
}

/**
 * Send a message to Slack
 *
 * @param message - The message to send
 */
async function sendSlackMessage(message: string): Promise<void> {
  try {
    const { client, channel } = await getSlackClient();

    await client.chat.postMessage({
      channel: channel as string,
      text: message,
    });
  } catch (error) {
    console.error("Error sending Slack message:", error);
  }
}

const notProfitableUserMemory = new ShortTermIgnoreMemory(
  3 * 60, // 3 minutes
  STATE_DIR_PATH,
);

/**
 * Run the Curve liquidator bot
 *
 * @param index - Index of the run
 */
export async function runCurveBot(index: number): Promise<void> {
  printLog(index, "Running Curve liquidator bot");

  const config = await getConfig(hre);

  if (!config.liquidatorBotCurve) {
    throw new Error("Liquidator bot Curve config is not found");
  }

  const { liquidatorBotDeployer } = await getNamedAccounts();
  const { contract: flashMintLiquidatorBotContract } =
    await getCurveFlashMintLiquidatorBot(liquidatorBotDeployer);
  const { contract: flashLoanliquidatorBotContract } =
    await getCurveFlashLoanLiquidatorBot(liquidatorBotDeployer);

  let allUserAddresses = await getAllLendingUserAddresses();

  printLog(index, `Found ${allUserAddresses.length} users totally`);

  // Filter the ignored users
  allUserAddresses = allUserAddresses.filter(
    (userAddress: string) => !notProfitableUserMemory.isIgnored(userAddress),
  );
  printLog(
    index,
    `Found ${allUserAddresses.length} users after filtering the ignored ones`,
  );

  // Shuffle the user addresses to make sure all addresses have the opportunity to be checked
  allUserAddresses = allUserAddresses.sort(() => Math.random() - 0.5);

  const batchedAllUserAddresses = splitToBatches(
    allUserAddresses,
    config.liquidatorBotCurve.liquidatingBatchSize,
  );

  for (const batchUserAddresses of batchedAllUserAddresses) {
    const batchIndex = batchedAllUserAddresses.indexOf(batchUserAddresses);
    printLog(
      index,
      `Liquidating batch ${batchIndex + 1} of ${batchedAllUserAddresses.length}`,
    );

    try {
      await runBotBatch(
        index,
        batchUserAddresses,
        liquidatorBotDeployer,
        flashMintLiquidatorBotContract,
        flashLoanliquidatorBotContract,
        config.liquidatorBotCurve.healthFactorBatchSize,
        config.liquidatorBotCurve.healthFactorThreshold,
        config.liquidatorBotCurve.profitableThresholdInUSD,
      );
    } catch (error: any) {
      printLog(
        index,
        `Error occurred at batch ${batchIndex + 1} of ${batchedAllUserAddresses.length}: ${error}`,
      );
    }

    printLog(
      index,
      `Finished liquidating batch ${
        batchIndex + 1
      } of ${batchedAllUserAddresses.length}`,
    );
    printLog(index, ``);
  }

  printLog(index, `Finished running liquidator bot`);
}

/**
 * Run the Curve liquidator bot for a batch of users
 *
 * @param index - Index of the run
 * @param allUserAddresses - All user addresses
 * @param liquidatorBotDeployer - Address of the liquidator bot deployer
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract
 * @param flashLoanliquidatorBotContract - The flash loan liquidator bot contract
 * @param healthFactorBatchSize - The health factor batch size
 * @param healthFactorThreshold - The health factor threshold
 * @param profitableThresholdInUSD - The profitable threshold in USD
 */
export async function runBotBatch(
  index: number,
  allUserAddresses: string[],
  liquidatorBotDeployer: string,
  flashMintLiquidatorBotContract: FlashMintLiquidatorAaveBorrowRepayCurve,
  flashLoanliquidatorBotContract: FlashLoanLiquidatorAaveBorrowRepayCurve,
  healthFactorBatchSize: number,
  healthFactorThreshold: number,
  profitableThresholdInUSD: number,
): Promise<void> {
  const liquidatableUserInfos: {
    userAddress: string;
    healthFactor: number;
  }[] = [];

  printLog(
    index,
    `Checking health factors of ${allUserAddresses.length} users`,
  );
  const healthFactorsRaw = await batchProcessing(
    allUserAddresses,
    healthFactorBatchSize,
    async (userAddress: string) => {
      try {
        const res = await getUserHealthFactor(userAddress);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return res;
      } catch (error: any) {
        printLog(
          index,
          `Error occurred while getting health factor of user ${userAddress}: ${error.message}`,
        );
        return undefined;
      }
    },
    false,
  );

  // Only keep the health factors that are not undefined
  const healthFactors = healthFactorsRaw.filter(
    (healthFactor) => healthFactor !== undefined,
  ) as number[];

  printLog(index, `Fetched ${healthFactors.length} health factors`);

  if (healthFactors.length === 0) {
    printLog(index, `No health factors fetched, skipping`);
    return;
  }

  for (let i = 0; i < allUserAddresses.length; i++) {
    if (healthFactors[i] < healthFactorThreshold) {
      liquidatableUserInfos.push({
        userAddress: allUserAddresses[i],
        healthFactor: healthFactors[i],
      });
    }
  }

  printLog(index, `Found ${liquidatableUserInfos.length} liquidatable users`);

  for (const userInfo of liquidatableUserInfos) {
    // Initialize the state
    const userState: UserStateLog = {
      healthFactor: userInfo.healthFactor.toString(),
      toLiquidateAmount: "", // not calculated yet
      collateralToken: undefined, // not calculated yet
      debtToken: undefined, // not calculated yet
      lastTrial: Date.now(),
      success: false, // not calculated yet
      profitInUSD: "", // not calculated yet
      profitable: false, // not calculated yet
      error: "", // not calculated yet
      errorMessage: "", // not calculated yet
    };

    try {
      printLog(
        index,
        `Checking user ${userInfo.userAddress} for liquidation with health factor ${userInfo.healthFactor}`,
      );

      const liquidationParams = await getUserLiquidationParams(
        userInfo.userAddress,
      );

      // Update the state
      userState.toLiquidateAmount =
        liquidationParams.toLiquidateAmount.toString();
      userState.collateralToken = {
        address: liquidationParams.collateralToken.reserveTokenInfo.address,
        symbol: liquidationParams.collateralToken.reserveTokenInfo.symbol,
      };
      userState.debtToken = {
        address: liquidationParams.debtToken.reserveTokenInfo.address,
        symbol: liquidationParams.debtToken.reserveTokenInfo.symbol,
      };

      if (liquidationParams.toLiquidateAmount.isZero()) {
        printLog(
          index,
          `User ${userInfo.userAddress} has 0 debt to liquidate, skipping`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);

        // State after liquidation
        userState.success = false;
        userState.error = "No debt to liquidate";
        userState.errorMessage = "No debt to liquidate";
      } else {
        // Calculate the profit
        const liquidationProfitInUSD = await getLiquidationProfitInUSD(
          liquidationParams.debtToken.reserveTokenInfo,
          {
            rawValue: BigNumber.from(liquidationParams.debtToken.priceInUSD),
            decimals: liquidationParams.debtToken.priceDecimals,
          },
          liquidationParams.toLiquidateAmount.toBigInt(),
        );

        // Update the state
        userState.profitInUSD = liquidationProfitInUSD.toString();
        userState.profitable =
          liquidationProfitInUSD >= profitableThresholdInUSD;

        if (userState.profitable) {
          // Perform liquidation
          printLog(
            index,
            `Liquidating user ${userInfo.userAddress} with health factor ${userInfo.healthFactor}`,
          );

          // State before liquidation
          userState.lastTrial = Date.now();
          userState.success = false;

          const txHash = await performCurveLiquidationDefault(
            liquidationParams.userAddress,
            liquidatorBotDeployer,
            liquidationParams.debtToken.reserveTokenInfo.address,
            liquidationParams.collateralToken.reserveTokenInfo.address,
            liquidationParams.toLiquidateAmount.toBigInt(),
            flashMintLiquidatorBotContract,
            flashLoanliquidatorBotContract,
          );

          // State after liquidation
          userState.success = true;

          // Send successful liquidation notification to Slack
          const successMessage =
            `<!channel> 🎯 *Successful Curve DEX Liquidation* 🎯\n\n` +
            `User \`${userInfo.userAddress}\`:\n` +
            `• Health Factor: ${userInfo.healthFactor}\n` +
            `• Profit: $${Number(userState.profitInUSD).toFixed(2)}\n` +
            `• Collateral Token: ${userState.collateralToken?.symbol}\n` +
            `• Debt Token: ${userState.debtToken?.symbol}\n` +
            `• Liquidated Amount: ${ethers.formatUnits(
              userState.toLiquidateAmount,
              liquidationParams.debtToken.reserveTokenInfo.decimals,
            )}\n` +
            `• Transaction Hash: ${txHash}`;

          await sendSlackMessage(successMessage);
        } else {
          printLog(
            index,
            `User ${userInfo.userAddress} is not profitable to liquidate due to profitable threshold`,
          );
          notProfitableUserMemory.put(userInfo.userAddress);

          // State after liquidation
          userState.success = false;
        }
      }
    } catch (error: any) {
      // Check if error is an NotProfitableLiquidationError
      if (error instanceof NotProfitableLiquidationError) {
        printLog(
          index,
          `User ${userInfo.userAddress} is not profitable to liquidate with error: ${error.message}`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);

        // State after liquidation
        userState.success = false;
        userState.collateralToken = {
          address: error.collateralTokenInfo.address,
          symbol: error.collateralTokenInfo.symbol,
        };
        userState.debtToken = {
          address: error.borrowTokenInfo.address,
          symbol: error.borrowTokenInfo.symbol,
        };
        userState.error = error;
        userState.errorMessage = error.message;
      } else if (error.message.includes("No defined pools")) {
        printLog(
          index,
          `User ${userInfo.userAddress} has no defined pools, skipping`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);

        // State after liquidation
        userState.success = false;
        userState.error = error;
        userState.errorMessage = error.message;
      } else {
        printLog(
          index,
          `Error occurred while liquidating user ${userInfo.userAddress}: ${error}`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);

        // State after liquidation
        userState.success = false;
        userState.error = error;
        userState.errorMessage = error.message;

        // Send error notification to Slack for significant errors
        const errorMessage =
          `<!channel> ⚠️ *Curve DEX Liquidation Error* ⚠️\n\n` +
          `Failed to liquidate user \`${userInfo.userAddress}\`:\n` +
          `• Health Factor: ${userInfo.healthFactor}\n` +
          `• Error: ${error.message}\n` +
          `• Collateral Token: ${userState.collateralToken?.symbol}\n` +
          `• Debt Token: ${userState.debtToken?.symbol}`;

        await sendSlackMessage(errorMessage);
      }
    }

    // Dump to JSON file with pretty print
    saveToFile(
      `${STATE_DIR_PATH}/${USER_STATE_DIR_NAME}/${userInfo.userAddress}.json`,
      JSON.stringify(userState, null, 2),
    );
  }
}
