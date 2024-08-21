import hre from "hardhat";

import { getEmissionAdmin } from "../../../utils/lending/rewards";

const main = async (): Promise<void> => {
  const reward = process.env.reward;
  console.log("Your input: ", reward);

  if (!reward) {
    throw new Error("Invalid input. Please provide reward address.");
  }

  console.log(await getEmissionAdmin(hre, reward));
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
