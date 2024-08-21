import hre from "hardhat";

import { deployContract } from "../utils/deploy";

/**
 * Deploy the test WETH9 contract
 */
async function main(): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();
  await deployContract(
    hre,
    "WETH9",
    [],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
