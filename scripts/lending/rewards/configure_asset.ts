import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import hre from "hardhat";

import {
  AssetUpdateData,
  configureAssets,
} from "../../../utils/lending/rewards";

const main = async (): Promise<void> => {
  const inputJsonPath = process.env.dataFile;
  console.log("Your input", inputJsonPath);

  if (!inputJsonPath) {
    console.error("Invalid input format. Please provide valid JSON file path.");
    process.exit(1);
  }

  const fs = require("fs");

  const rawData = fs.readFileSync(inputJsonPath);
  const parsedData = JSON.parse(rawData);

  const updateData: AssetUpdateData[] = parsedData.map((data: any) => {
    if (!ethers.isAddress(data.asset) || !ethers.isAddress(data.reward)) {
      throw new Error(
        `Invalid address format for asset or reward: ${data.asset}, ${data.reward}`,
      );
    }

    if (isNaN(data.distributionEnd) || isNaN(data.emissionPerSecond)) {
      throw new Error(
        `Invalid number format for distributionEnd or emissionPerSecond: ${data.distributionEnd}, ${data.emissionPerSecond}`,
      );
    }
    return {
      asset: data.asset,
      reward: data.reward,
      distributionEnd: new BigNumber(data.distributionEnd).toString(),
      emissionPerSecond: data.emissionPerSecond,
    } as AssetUpdateData;
  });

  await configureAssets(hre, updateData);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
