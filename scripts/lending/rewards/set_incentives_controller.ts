import hre from "hardhat";

import { INCENTIVES_PROXY_ID } from "../../../utils/lending/deploy-ids";

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

  const { lendingPoolAdmin } = await hre.getNamedAccounts();
  const admin = await hre.ethers.getSigner(lendingPoolAdmin);

  const { address: controllerAddress } =
    await hre.deployments.get(INCENTIVES_PROXY_ID);

  for (const asset of parsedData) {
    if (!asset || !hre.ethers.isAddress(asset)) {
      throw new Error(`Invalid asset address: ${asset}`);
    }

    const incentivedToken = await hre.ethers.getContractAt(
      "IncentivizedERC20",
      asset,
      admin,
    );

    const tokenIncentiveController =
      await incentivedToken.getIncentivesController();

    if (tokenIncentiveController !== controllerAddress) {
      console.log(
        `Setting incentive controller for ${asset} to ${controllerAddress}`,
      );
      const tx =
        await incentivedToken.setIncentivesController(controllerAddress);
      console.log(tx);
      console.log(
        `Incentive controller for ${asset} set to ${controllerAddress} at ${(tx as any).hash}`,
      );
    } else {
      console.log(
        `Incentive controller already set to ${controllerAddress} for ${asset}`,
      );
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
