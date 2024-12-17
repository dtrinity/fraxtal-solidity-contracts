import { BigNumber } from "@ethersproject/bignumber";
import hre, { getNamedAccounts } from "hardhat";

import { getConfig } from "../../config/config";
import {
  FlashLoanLiquidatorBorrowRepayAave,
  FlashMintLiquidatorBorrowRepayAave,
} from "../../typechain-types";
import { getUserHealthFactor } from "../../utils/lending/account";
import { STATE_DIR_PATH, USER_STATE_DIR_NAME } from "../constants";
import {
  batchedPromiseAll,
  saveToFile,
  ShortTermIgnoreMemory,
  splitToBatches,
} from "../utils";
import { NotProfitableLiquidationError } from "./errors";
import { printLog } from "./log";
import { UserStateLog } from "./types";
import {
  getFlashLoanLiquidatorBot,
  getFlashMintLiquidatorBot,
  getLiquidationProfitInUSD,
  performLiquidation,
} from "./utils";
import {
  getAllLendingUserAddresses,
  getUserLiquidationParams,
} from "./utils.run";

const notProfitableUserMemory = new ShortTermIgnoreMemory(
  60 * 60, // 1 hour
  STATE_DIR_PATH,
);

/**
 * Run the liquidator bot
 *
 * @param index - The session index (to differentiate between different runs' logs)
 */
export async function runBot(index: number): Promise<void> {
  printLog(index, "Running liquidator bot");

  const { liquidatorBotDeployer } = await getNamedAccounts();
  const { contract: flashMintLiquidatorBotContract } =
    await getFlashMintLiquidatorBot(liquidatorBotDeployer);
  const { contract: flashLoanliquidatorBotContract } =
    await getFlashLoanLiquidatorBot(liquidatorBotDeployer);

  const config = await getConfig(hre);

  let allUserAddresses = await getAllLendingUserAddresses();

  printLog(index, `Found ${allUserAddresses.length} users totally`);

  // Filter the ignored users
  allUserAddresses = allUserAddresses.filter(
    (userAddress) => !notProfitableUserMemory.isIgnored(userAddress),
  );
  printLog(
    index,
    `Found ${allUserAddresses.length} users after filtering the ignored ones`,
  );

  // Shuffle the user addresses to make sure all addresses have the opportunity to be checked
  allUserAddresses = allUserAddresses.sort(() => Math.random() - 0.5);

  const batchedAllUserAddresses = splitToBatches(
    allUserAddresses,
    config.liquidatorBot.liquidatingBatchSize,
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
 * Run the liquidator bot for a batch of users
 *
 * @param index - The session index (to differentiate between different runs' logs)
 * @param allUserAddresses - All user addresses
 * @param liquidatorBotDeployer - The deployer address of the liquidator bot
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract
 * @param flashLoanliquidatorBotContract - The flash loan liquidator bot contract
 */
export async function runBotBatch(
  index: number,
  allUserAddresses: string[],
  liquidatorBotDeployer: string,
  flashMintLiquidatorBotContract: FlashMintLiquidatorBorrowRepayAave,
  flashLoanliquidatorBotContract: FlashLoanLiquidatorBorrowRepayAave,
): Promise<void> {
  const config = await getConfig(hre);

  const liquidatableUserInfos: {
    userAddress: string;
    healthFactor: number;
  }[] = [];

  printLog(
    index,
    `Checking health factors of ${allUserAddresses.length} users`,
  );

  // If failed to get the health factor, return undefined
  const healthFactorsRaw = await batchedPromiseAll(
    allUserAddresses.map((userAddress) => {
      try {
        return getUserHealthFactor(userAddress);
      } catch (error: any) {
        printLog(
          index,
          `Error occurred while getting health factor of user ${userAddress}: ${error.message}`,
        );
        return Promise.resolve(undefined);
      }
    }),
    config.liquidatorBot.healthFactorBatchSize,
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
    if (healthFactors[i] < config.liquidatorBot.healthFactorThreshold) {
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
          liquidationProfitInUSD >=
          config.liquidatorBot.profitableThresholdInUSD;

        if (userState.profitable) {
          // Perform liquidation
          printLog(
            index,
            `Liquidating user ${userInfo.userAddress} with health factor ${userInfo.healthFactor}`,
          );

          // State before liquidation
          userState.lastTrial = Date.now();
          userState.success = false;

          await performLiquidation(
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
          `Error occurred while liquidating user ${userInfo.userAddress}: ${error.message}`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);

        // State after liquidation
        userState.success = false;
        userState.error = error;
        userState.errorMessage = error.message;
      }
    }

    // Dump to JSON file with pretty print
    saveToFile(
      `${STATE_DIR_PATH}/${USER_STATE_DIR_NAME}/${userInfo.userAddress}.json`,
      JSON.stringify(userState, null, 2),
    );
  }
}
