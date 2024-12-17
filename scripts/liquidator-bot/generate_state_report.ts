import { createObjectCsvWriter as createCsvWriter } from "csv-writer";

import { USER_STATE_DIR_NAME } from "../../utils/constants";
import { UserStateLog } from "../../utils/liquidator-bot/types";

interface UserStateCSVRecord {
  userAddress: string;
  healthFactor: string;
  toLiquidateAmount: string;
  profitInUSD: string;
  collateralTokenSymbol: string | undefined;
  collateralTokenAddress: string | undefined;
  debtTokenSymbol: string | undefined;
  debtTokenAddress: string | undefined;
  lastTrial: string;
  profitable: boolean;
  success: boolean;
  errorMessage: string;
}

/**
 * To run this script, run the following command:
 *     yarn ts-node scripts/liquidator-bot/generate_state_report.ts <state-path>
 *
 * The state path is the directory path where the user state logs are stored, which has the following structure:
 *    <state-path>/user-state/<user-address>.json
 *    <state-path>/ignoreMemory.json
 *
 * The report will be generated in the same directory as the state path with the name <state-path-dir-name>-report.csv
 */
async function main(): Promise<void> {
  // Get state path from CLI arguments
  const statePath = process.argv[2];

  if (!statePath) {
    throw new Error("State path is required as the first argument");
  }

  console.log(`Generating state report from ${statePath}`);

  // Make sure the state directory path is exists
  const fs = require("fs");

  if (!fs.existsSync(statePath)) {
    throw new Error(`State path does not exist: ${statePath}`);
  }

  const userStateFilesDir = `${statePath}/${USER_STATE_DIR_NAME}`;

  if (!fs.existsSync(userStateFilesDir)) {
    throw new Error(
      `User state files directory does not exist: ${userStateFilesDir}`,
    );
  }

  // Load all JSON files in the user state directory and parse into objects array
  const userStateRecords: UserStateCSVRecord[] = fs
    .readdirSync(userStateFilesDir)
    .filter((fileName: string) => fileName.endsWith(".json"))
    .map((fileName: string) => {
      const data = fs.readFileSync(`${userStateFilesDir}/${fileName}`, "utf8");
      const res = JSON.parse(data) as UserStateLog;
      return convertUserStateToRecord(fileName.replace(".json", ""), res);
    });

  console.log(`Found ${userStateRecords.length} user state logs`);

  // Get the parent directory of state path by trimming the last directory /
  const path = require("path");
  const parentDir = path.dirname(statePath);
  const stateDirName = path.basename(statePath);
  const reportPath = `${parentDir}/${stateDirName}-report.csv`;

  // Convert userStateLogs into a table
  const csvWriter = createCsvWriter({
    path: reportPath,
    header: [
      { id: "userAddress", title: "User Address" },
      { id: "healthFactor", title: "Health Factor" },
      { id: "toLiquidateAmount", title: "To Liquidate Amount" },
      { id: "profitInUSD", title: "Profit In USD" },
      { id: "collateralTokenSymbol", title: "Collateral Token Symbol" },
      { id: "collateralTokenAddress", title: "Collateral Token Address" },
      { id: "debtTokenSymbol", title: "Debt Token Symbol" },
      { id: "debtTokenAddress", title: "Debt Token Address" },
      { id: "lastTrial", title: "Last Trial" },
      { id: "profitable", title: "Profitable" },
      { id: "success", title: "Success" },
      { id: "errorMessage", title: "Error Message" },
    ],
  });

  console.log(`Writing report to ${reportPath}`);
  await csvWriter.writeRecords(userStateRecords);

  console.log("");
  console.log("Summary");
  console.log("-------");
  console.log(
    ` - Successful        : ${userStateRecords.filter((record) => record.success).length}`,
  );
  console.log(
    ` - Failed profitable : ${userStateRecords.filter((record) => !record.success && record.profitable).length}`,
  );
  console.log(
    ` - Non-profitable    : ${userStateRecords.filter((record) => !record.success && !record.profitable).length}`,
  );
  console.log(` - Total             : ${userStateRecords.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/**
 * Convert a user state log object into a CSV record
 *
 * @param userAddress - The user address
 * @param userState - The user state log object
 * @returns The CSV record
 */
function convertUserStateToRecord(
  userAddress: string,
  userState: UserStateLog,
): UserStateCSVRecord {
  return {
    userAddress: userAddress,
    healthFactor: userState.healthFactor.toString(),
    toLiquidateAmount: userState.toLiquidateAmount.toString(),
    profitInUSD: userState.profitInUSD.toString(),
    collateralTokenSymbol: userState.collateralToken?.symbol,
    collateralTokenAddress: userState.collateralToken?.address,
    debtTokenSymbol: userState.debtToken?.symbol,
    debtTokenAddress: userState.debtToken?.address,
    lastTrial: new Date(userState.lastTrial).toUTCString(),
    profitable: userState.profitable,
    success: userState.success,
    errorMessage: userState.errorMessage,
  };
}
