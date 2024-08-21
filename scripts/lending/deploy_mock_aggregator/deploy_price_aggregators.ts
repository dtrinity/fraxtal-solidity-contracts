import hre from "hardhat";

import { deployTestPriceAggregator } from "../../../utils/lending/price-aggregator";

/**
 * Deploy the test price aggregator
 */
async function main(): Promise<void> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  await deployTestPriceAggregator(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    {
      SFRAX: 1.23456789,
      SFRXETH: 3210.0123,
    },
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
