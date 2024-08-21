import { ethers } from "ethers";
import hre from "hardhat";

import { getRewardsData } from "../../../utils/lending/rewards";

const main = async (): Promise<void> => {
  const inputJsonPath = process.env.queryFile;
  console.log("Your input", inputJsonPath);

  if (!inputJsonPath) {
    console.error("Invalid input format. Please provide valid JSON file path.");
    process.exit(1);
  }

  const fs = require("fs");

  let rawData;

  try {
    rawData = fs.readFileSync(inputJsonPath);
  } catch (error) {
    console.error("Error reading the JSON file:", error);
    process.exit(1);
  }

  let jsonData;

  try {
    jsonData = JSON.parse(rawData);
  } catch (error) {
    console.error("Error parsing the JSON file:", error);
    process.exit(1);
  }

  const { assets, rewards } = jsonData;

  if (!Array.isArray(assets) || !Array.isArray(rewards)) {
    console.error(
      "Invalid JSON structure. 'assets' and 'rewards' should be arrays.",
    );
    process.exit(1);
  }

  if (!assets.every(ethers.isAddress) || !rewards.every(ethers.isAddress)) {
    console.error("Invalid address found in 'assets' or 'rewards' array.");
    process.exit(1);
  }

  if (assets.length !== rewards.length) {
    console.error("Assets and rewards arrays must have the same length.");
    process.exit(1);
  }

  console.log(await getRewardsData(hre, assets, rewards));
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
