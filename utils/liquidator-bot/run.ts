import hre, { getNamedAccounts } from "hardhat";

import { getConfig } from "../../config/config";
import { getUserHealthFactor } from "../../utils/lending/account";
import { batchedPromiseAll, ShortTermIgnoreMemory } from "../utils";
import { NotProfitableLiquidationError } from "./errors";
import { printLog } from "./log";
import {
  getFlashLoanLiquidatorBot,
  getFlashMintLiquidatorBot,
  performLiquidation,
} from "./utils";
import {
  getAllLendingUserAddresses,
  getUserLiquidationParams,
  isProfitable,
} from "./utils.run";

const notProfitableUserMemory = new ShortTermIgnoreMemory(60 * 60); // 1 hour

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

  // Only try with the first 200 users to avoid network congestion
  allUserAddresses = allUserAddresses.slice(0, 200);

  const liquidatableUserInfos: {
    userAddress: string;
    healthFactor: number;
  }[] = [];

  printLog(
    index,
    `Checking health factors of ${allUserAddresses.length} users`,
  );

  const healthFactors = await batchedPromiseAll(
    allUserAddresses.map((userAddress) => getUserHealthFactor(userAddress)),
    config.liquidatorBot.healthFactorBatchSize,
  );

  if (healthFactors.length !== allUserAddresses.length) {
    throw new Error(
      "The health factors length does not match the user addresses length",
    );
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
    try {
      printLog(
        index,
        `Checking user ${userInfo.userAddress} for liquidation with health factor ${userInfo.healthFactor}`,
      );

      const liquidationParams = await getUserLiquidationParams(
        userInfo.userAddress,
      );
      const profitable = await isProfitable(
        liquidationParams.debtToken,
        liquidationParams.toLiquidateAmount,
      );

      if (profitable) {
        // Perform liquidation
        printLog(
          index,
          `Liquidating user ${userInfo.userAddress} with health factor ${userInfo.healthFactor}`,
        );
        await performLiquidation(
          liquidationParams.userAddress,
          liquidatorBotDeployer,
          liquidationParams.debtToken.reserveTokenInfo.address,
          liquidationParams.collateralToken.reserveTokenInfo.address,
          liquidationParams.toLiquidateAmount.toBigInt(),
          flashMintLiquidatorBotContract,
          flashLoanliquidatorBotContract,
        );
      } else {
        printLog(
          index,
          `User ${userInfo.userAddress} is not profitable to liquidate due to profitable threshold`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);
      }
    } catch (error: any) {
      // Check if error is an NotProfitableLiquidationError
      if (error instanceof NotProfitableLiquidationError) {
        printLog(
          index,
          `User ${userInfo.userAddress} is not profitable to liquidate with error: ${error.message}`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);
      } else if (error.message.includes("No defined pools")) {
        printLog(
          index,
          `User ${userInfo.userAddress} has no defined pools, skipping`,
        );
        notProfitableUserMemory.put(userInfo.userAddress);
      } else {
        notProfitableUserMemory.put(userInfo.userAddress);
        throw error;
      }
    }
  }

  printLog(index, `Finished running liquidator bot`);
}
