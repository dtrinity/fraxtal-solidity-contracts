import { WebClient } from "@slack/web-api";
import dotenv from "dotenv";
import { ethers } from "ethers";
import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../utils/constants";
import { getOraclePrice } from "../../../utils/dex/oracle";
import {
  getUserAccountData,
  getUsersReserveBalances,
} from "../../../utils/lending/account";
import { getReservesList } from "../../../utils/lending/pool";
import { getReserveConfigurationData } from "../../../utils/lending/reserve";
import { getAllLendingUserAddresses } from "../../../utils/liquidator-bot/curve/utils.run";

// Load environment variables
dotenv.config();

const SLACK_TOKEN = process.env.LIQUIDATOR_BOT_SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.LIQUIDATOR_BOT_SLACK_CHANNEL_ID;

if (!SLACK_TOKEN || !SLACK_CHANNEL) {
  throw new Error(
    "LIQUIDATOR_BOT_SLACK_BOT_TOKEN and LIQUIDATOR_BOT_SLACK_CHANNEL_ID must be set in environment variables",
  );
}

const slack = new WebClient(SLACK_TOKEN);

// Keep track of last health factors
const lastHealthFactors: { [address: string]: number } = {};

/**
 * Send a message to Slack
 *
 * @param message - The message to send
 * @param files - Array of files to send
 * @param files[].content - The content of the file
 * @param files[].filename - The filename of the file
 * @param files[].comment - The comment for this specific file
 */
async function sendSlackMessage(
  message: string,
  files?: Array<{ content: string; filename: string; comment: string }>,
): Promise<void> {
  try {
    const result = await slack.chat.postMessage({
      channel: SLACK_CHANNEL as string,
      text: message,
    });

    if (files && files.length > 0) {
      for (const file of files) {
        await slack.files.uploadV2({
          /* eslint-disable camelcase -- Naming convention is disabled for the pool names */
          channel_id: SLACK_CHANNEL,
          file_uploads: [
            {
              content: file.content,
              filename: file.filename,
            },
          ],
          initial_comment: file.comment,
          thread_ts: result.ts, // reply to the thread
          /* eslint-enable camelcase -- Re-enable naming convention at the end of the file */
        });
      }
    }
  } catch (error) {
    console.error("Error sending Slack message:", error);
  }
}

/**
 * Sleep for a given number of milliseconds
 *
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the given number of milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastStatsTime = 0;
const STATS_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Generate CSV content for detailed stats report
 *
 * @param userDetails - Array of user details containing address, health factor, collateral and debt
 * @param healthFactorBatchSize - The batch size for fetching user data
 * @returns CSV content as string
 */
async function generateDetailedStatsCSVContent(
  userDetails: Array<{
    address: string;
    healthFactor: number;
    totalCollateral: number;
    totalDebt: number;
  }>,
  healthFactorBatchSize: number,
): Promise<{
  detailedReportCSVContent: string;
  assetInfoContent: string;
}> {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  console.log("Getting reserves list");
  const reservesList = await getReservesList();

  const reservesInfoMap: {
    [address: string]: {
      symbol: string;
      decimals: number;
      price: number;
      ltv: number;
      isActive: boolean;
      isFrozen: boolean;
      canBeBorrowed: boolean;
      canBeCollateral: boolean;
      liquidationBonus: number;
      liquidationThreshold: number;
    };
  } = {};

  console.log("Getting reserves info");

  for (const reserve of reservesList) {
    const tokenContract = await hre.ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
      reserve,
    );

    // Get asset price
    const [price, reserveData] = await Promise.all([
      getOraclePrice(liquidatorBotDeployer, reserve),
      getReserveConfigurationData(reserve),
    ]);

    reservesInfoMap[reserve] = {
      symbol: await tokenContract.symbol(),
      decimals: Number(await tokenContract.decimals()),
      price: Number(price) / 10 ** AAVE_ORACLE_USD_DECIMALS,
      ltv: Number(reserveData.ltv) / 10000,
      isActive: reserveData.isActive,
      isFrozen: reserveData.isFrozen,
      canBeBorrowed: reserveData.borrowingEnabled,
      canBeCollateral: reserveData.ltv > 0,
      liquidationBonus: Number(reserveData.liquidationBonus) / 10000,
      liquidationThreshold: Number(reserveData.liquidationThreshold) / 10000,
    };
  }

  console.log("Getting users reserve balances");
  const usersReserveBalances = await getUsersReserveBalances(
    userDetails.map((user) => user.address),
    healthFactorBatchSize,
  );
  // Create header row with base columns and collateral/debt columns grouped
  const headers = [
    "user_address",
    "health_factor",
    "ltv",
    "total_collateral_usd",
    "dUSD_deposit_usd",
  ];

  const collateralReservesList = Object.keys(reservesInfoMap).filter(
    (reserve) => reservesInfoMap[reserve].canBeCollateral,
  );

  // Add all collateral columns first
  collateralReservesList.forEach((reserve) => {
    headers.push(`collateral_${reservesInfoMap[reserve].symbol}_usd`);
  });

  // Then add total debt
  headers.push("total_debt_usd");

  // Add net_worth_usd = total collateral + total dusd deposit - total debt
  headers.push("net_worth_usd");

  // Add delta_to_liquidation = (1 / health factor) - 1
  headers.push("delta_to_liquidation");

  const config = await getConfig(hre);

  // Now generate data rows
  console.log("Generating data rows");
  const rows = userDetails.map((user) => {
    const ltv = user.totalDebt / user.totalCollateral;
    const row = [
      user.address,
      user.healthFactor.toFixed(4),
      ltv.toFixed(4),
      user.totalCollateral.toFixed(2),
    ];

    const userBalances = usersReserveBalances[user.address] || {};

    // Add dUSD deposit (as dUSD is not counted in the total collateral and not considered as collateral, thus we need to add it manually)
    const dUSDAddress = config.dusd.address;
    const dUSDBalance = userBalances[dUSDAddress];
    const dUSDCollateralValue = ethers.formatUnits(
      dUSDBalance.collateral,
      reservesInfoMap[dUSDAddress].decimals,
    );
    const dUSDBalanceUSD =
      Number(dUSDCollateralValue) * reservesInfoMap[dUSDAddress].price;
    row.push(dUSDBalanceUSD.toFixed(2));

    // Add collateral balances for each reserve
    collateralReservesList.forEach((reserve) => {
      const reserveBalance = userBalances[reserve] || {
        collateral: 0,
        debt: 0,
      };
      const collateralValue = ethers.formatUnits(
        reserveBalance.collateral,
        reservesInfoMap[reserve].decimals,
      );
      const collateralValueUSD =
        Number(collateralValue) * reservesInfoMap[reserve].price;
      row.push(collateralValueUSD.toFixed(2));
    });

    // Add total debt
    row.push(user.totalDebt.toFixed(2));

    // Add net_worth_usd = total collateral + total dusd deposit - total debt
    const netWorthUSD = user.totalCollateral + dUSDBalanceUSD - user.totalDebt;
    row.push(netWorthUSD.toFixed(2));

    // Add delta_to_liquidation = (1 / health factor) - 1
    const deltaToLiquidation = 1 / user.healthFactor - 1;
    row.push(deltaToLiquidation.toFixed(4));

    return row.join(",");
  });

  const assetInfoHeaders = [
    "address",
    "symbol",
    "decimals",
    "price_usd",
    "ltv",
    "is_active",
    "is_frozen",
    "can_be_borrowed",
    "can_be_collateral",
    "liquidation_bonus",
    "liquidation_threshold",
  ];

  const assetInfoContent = Object.entries(reservesInfoMap)
    .map(([address, info]) =>
      [
        address,
        info.symbol,
        info.decimals,
        info.price.toFixed(2),
        info.ltv.toFixed(4),
        info.isActive,
        info.isFrozen,
        info.canBeBorrowed,
        info.canBeCollateral,
        info.liquidationBonus.toFixed(4),
        info.liquidationThreshold.toFixed(4),
      ].join(","),
    )
    .join("\n");

  return {
    detailedReportCSVContent: [headers.join(","), ...rows].join("\n"),
    assetInfoContent: [assetInfoHeaders.join(","), assetInfoContent].join("\n"),
  };
}

/**
 * Check the health factors of all users
 *
 * @param healthFactorBatchSize - The batch size for fetching user data
 */
async function checkHealthFactors(
  healthFactorBatchSize: number,
): Promise<void> {
  console.log("Checking all user health factors");

  const allUserAddresses = await getAllLendingUserAddresses();
  console.log(`Found ${allUserAddresses.length} users totally`);

  const userDataRaw: (
    | Awaited<ReturnType<typeof getUserAccountData>>
    | undefined
  )[] = [];
  const sleepSecondsBetweenBatches = 0.2;

  for (let i = 0; i < allUserAddresses.length; i += healthFactorBatchSize) {
    const batch = allUserAddresses.slice(i, i + healthFactorBatchSize);
    const batchPromises = batch.map((userAddress: string) => {
      try {
        return getUserAccountData(userAddress);
      } catch (error: any) {
        console.log(
          `Error occurred while getting account data of user ${userAddress}: ${error.message}`,
        );
        return Promise.resolve(undefined);
      }
    });

    const batchResults = await Promise.all(batchPromises);
    userDataRaw.push(...batchResults);

    console.log(
      `Processed ${i + healthFactorBatchSize} of ${allUserAddresses.length} users`,
    );

    if (i + healthFactorBatchSize < allUserAddresses.length) {
      await new Promise((resolve) =>
        setTimeout(resolve, sleepSecondsBetweenBatches * 1000),
      );
    }
  }

  const userData = userDataRaw.filter((data) => data !== undefined);

  console.log(`Fetched ${userData.length} user data entries`);

  if (userData.length === 0) {
    console.log(`No user data fetched`);
    return;
  }

  // Get public IP
  let publicIp = "unknown";

  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    publicIp = data.ip;
  } catch (error) {
    console.log("Failed to get public IP:", error);
  }

  const userDetails = allUserAddresses
    .map((address, i) => {
      const data = userData[i];
      if (!data) return undefined;
      return {
        address,
        healthFactor: Number(data.healthFactor) / 1e18,
        totalCollateral: Number(data.totalCollateralBase) / 1e8,
        totalDebt: Number(data.totalDebtBase) / 1e8,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  // Sort by health factor ascending to check most at-risk users first
  userDetails.sort((a, b) => a.healthFactor - b.healthFactor);

  const liquidatableUsers = userDetails.filter((user) => user.healthFactor < 1);

  const mintDebtThreshold = 1e-3;
  const filteredLiquidatableUsers = liquidatableUsers.filter(
    (user) => user.totalDebt > mintDebtThreshold,
  );

  if (filteredLiquidatableUsers.length > 0) {
    // Filter users whose health factor has changed
    const usersWithChangedHealthFactor = filteredLiquidatableUsers.filter(
      (user) => {
        const lastHealthFactor = lastHealthFactors[user.address];
        const healthFactorChanged =
          lastHealthFactor === undefined ||
          lastHealthFactor !== user.healthFactor;
        // Update last health factor
        lastHealthFactors[user.address] = user.healthFactor;
        return healthFactorChanged;
      },
    );

    console.log(
      `Found ${usersWithChangedHealthFactor.length} liquidatable users with updated health factors`,
    );

    if (usersWithChangedHealthFactor.length > 0) {
      const message = `<!channel> 🚨 *LIQUIDATION ALERT* 🚨\n\nBot IP: ${publicIp}\n\n${usersWithChangedHealthFactor
        .map((user) => {
          const ltv = user.totalDebt / user.totalCollateral;
          return (
            `User \`${user.address}\`:\n` +
            `• Health Factor: ${user.healthFactor.toFixed(8)}\n` +
            `• LTV: ${ltv.toFixed(4)}\n` +
            `• Total Collateral: ${user.totalCollateral.toFixed(4)}\n` +
            `• Total Debt: ${user.totalDebt.toFixed(4)}\n`
          );
        })
        .join("\n")}`;

      await sendSlackMessage(message);
      console.log(
        `Found ${usersWithChangedHealthFactor.length} liquidatable users with updated health factors, notification sent to Slack`,
      );
    } else {
      console.log("Liquidatable users found but health factors unchanged");
    }
  } else {
    console.log("No liquidatable users found");
    // Clear lastHealthFactors when no liquidatable users
    Object.keys(lastHealthFactors).forEach(
      (key) => delete lastHealthFactors[key],
    );
  }

  // Send stats every hour
  const now = Date.now();

  if (now - lastStatsTime >= STATS_INTERVAL) {
    console.log("Sending stats message");
    const activeUsers = userDetails.filter(
      (user) => user.totalCollateral > 0 || user.totalDebt > 0,
    );

    // We also consider dUSD deposit as well (as it's not counted in the total collateral), thus
    // as use all users, not just active users
    const totalCollateral = userDetails.reduce(
      (sum, user) => sum + user.totalCollateral,
      0,
    );
    const totalDebt = userDetails.reduce(
      (sum, user) => sum + user.totalDebt,
      0,
    );

    const lowestHealthFactorUser = userDetails[0];
    const lowestHealthFactorUserFiltered = userDetails.find(
      (user) => user.totalDebt > mintDebtThreshold,
    );

    const nextStatsTime = new Date(now + STATS_INTERVAL);
    const statsMessage =
      `📊 *System Status Update* 📊\n\n` +
      `Bot IP: ${publicIp}\n\n` +
      `• Total Users: ${allUserAddresses.length}\n` +
      `• Total Liquidatable Users: ${liquidatableUsers.length}\n` +
      `• Total Liquidatable Users (debt > ${mintDebtThreshold}): ${filteredLiquidatableUsers.length}\n` +
      `• Total Active Users: ${activeUsers.length}\n` +
      `• Total Collateral: ${totalCollateral.toFixed(4)}\n` +
      `• Total Debt: ${totalDebt.toFixed(4)}\n` +
      `• Lowest Health Factor: ${lowestHealthFactorUser?.healthFactor.toFixed(4)} (User: \`${lowestHealthFactorUser?.address}\`)\n` +
      `• Lowest Health Factor (debt > ${mintDebtThreshold}): ${lowestHealthFactorUserFiltered?.healthFactor.toFixed(4)} (User: \`${lowestHealthFactorUserFiltered?.address}\`)\n` +
      `\nAll users are in good standing 👍\n` +
      `Next stats update at: ${nextStatsTime.toISOString()}`;

    console.log("Generating detailed stats CSV content");
    const { detailedReportCSVContent, assetInfoContent } =
      await generateDetailedStatsCSVContent(userDetails, healthFactorBatchSize);
    const timestamp = new Date()
      .toISOString()
      .replace(/[T:]/g, "_")
      .slice(0, 19);

    console.log("Sending stats message");
    await sendSlackMessage(statsMessage, [
      {
        content: detailedReportCSVContent,
        filename: `lending_detailed_stats_${timestamp}.csv`,
        comment:
          "Detailed CSV report (only for user with non-zero collateral or debt)",
      },
      {
        content: assetInfoContent,
        filename: `lending_asset_info_${timestamp}.csv`,
        comment: "Asset info and prices",
      },
    ]);
    console.log("Stats message sent");
    lastStatsTime = now;
  }

  console.log("--------------------------------");
}

/**
 * Main function to run the Slack reporter
 */
async function main(): Promise<void> {
  // Get batch size from environment variable
  const healthFactorBatchSize = process.env.HEALTH_FACTOR_BATCH_SIZE;

  if (!healthFactorBatchSize) {
    throw new Error(
      "HEALTH_FACTOR_BATCH_SIZE must be set in environment variables",
    );
  }

  const healthFactorBatchSizeInt = parseInt(healthFactorBatchSize, 10);

  if (isNaN(healthFactorBatchSizeInt)) {
    throw new Error("HEALTH_FACTOR_BATCH_SIZE must be a valid number");
  }

  if (healthFactorBatchSizeInt <= 0) {
    throw new Error("HEALTH_FACTOR_BATCH_SIZE must be greater than 0");
  }

  while (true) {
    await checkHealthFactors(healthFactorBatchSizeInt);
    // Wait for 1.5 seconds before next check
    await sleep(1500);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
