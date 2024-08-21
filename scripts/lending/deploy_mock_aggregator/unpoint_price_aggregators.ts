import { ZeroAddress } from "ethers";
import hre from "hardhat";

import { ORACLE_ID } from "../../../utils/lending/deploy-ids";

/**
 * Remove the price aggregator so that it falls back to dSWAP instead
 */
async function main(): Promise<void> {
  const { lendingDeployer } = await hre.getNamedAccounts();

  const symbolAddresses: { [key: string]: string } = {
    SFRXETH: "0x93Bb4a786179bA2408A78240F354645A973EF0Bc",
    WFRXETH: "0xFC00000000000000000000000000000000000006",
  };

  const assetAddresses = [];
  const aggregatorAddresses = [];

  for (const [_, address] of Object.entries(symbolAddresses)) {
    assetAddresses.push(address);
    aggregatorAddresses.push(ZeroAddress);
  }

  const { address: aaveOracleAddress } = await hre.deployments.get(ORACLE_ID);

  const aaveOracleContract = await hre.ethers.getContractAt(
    "AaveOracle",
    aaveOracleAddress,
    await hre.ethers.getSigner(lendingDeployer),
  );

  await aaveOracleContract.setAssetSources(assetAddresses, aggregatorAddresses);

  console.log("Successfully unset asset sources");
}

main();
