import hre from "hardhat";

import { POOL_CONFIGURATOR_PROXY_ID } from "../../../utils/lending/deploy-ids";
import { getReserveTokenAddresses } from "../../../utils/lending/token";

const main = async (): Promise<void> => {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const reservesAddresses = await getReserveTokenAddresses(hre);

  // List of reserves to drop
  const reservesToDrop = ["FXS", "sfrxETH", "sUSDe", "sDAI"]; // Add more reserve symbols as needed

  const proxyDeployedResult = await hre.deployments.get(
    POOL_CONFIGURATOR_PROXY_ID,
  );
  const configuratorContract = await hre.ethers.getContractAt(
    "PoolConfigurator",
    proxyDeployedResult.address,
    await hre.ethers.getSigner(lendingDeployer),
  );

  const tokens: string[] = [];
  const symbols: string[] = [];

  for (const assetSymbol of reservesToDrop) {
    if (!reservesAddresses[assetSymbol]) {
      console.log(
        `- Skipping drop of ${assetSymbol} due to token address not being set in markets config`,
      );
      continue;
    }

    const tokenAddress = reservesAddresses[assetSymbol];
    tokens.push(tokenAddress);
    symbols.push(assetSymbol);
  }

  if (tokens.length) {
    console.log(`- Dropping ${tokens.length} reserves`);
    console.log(`------------------------`);
    console.log(`  - Configurator: ${await configuratorContract.getAddress()}`);
    console.log(`  - Reserves    : ${symbols.join(", ")}`);

    for (let i = 0; i < tokens.length; i++) {
      const tokenAddress = tokens[i];
      const tx = await configuratorContract.dropReserve(tokenAddress);
      const receipt = await tx.wait();
      console.log(`  - Dropped ${symbols[i]} (${tokenAddress})`);
      console.log(`    Tx hash: ${receipt?.hash}`);
      console.log(`    Gas used: ${receipt?.gasUsed.toString()}`);
    }
    console.log(`------------------------`);
  } else {
    console.log("No reserves to drop");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
