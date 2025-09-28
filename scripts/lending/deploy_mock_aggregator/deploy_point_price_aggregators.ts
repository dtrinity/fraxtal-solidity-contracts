import hre from "hardhat";

import { ORACLE_ID } from "../../../utils/lending/deploy-ids";
import { getTestPriceAggregatorNameFromSymbol } from "../../../utils/lending/oracle";
import { deployTestPriceAggregator } from "../../../utils/lending/price-aggregator";

/**
 * Deploy the test price aggregator and update the AaveOracle contract with the new asset sources.
 */
async function main(): Promise<void> {
  const { lendingDeployer } = await hre.getNamedAccounts();

  const symbolPrices = {
    SFRXETH: 3210.0123,
    WFRXETH: 3000.0,
  };
  const symbolAddresses: { [key: string]: string } = {
    SFRXETH: "0x93Bb4a786179bA2408A78240F354645A973EF0Bc",
    WFRXETH: "0xFC00000000000000000000000000000000000006",
  };

  await deployTestPriceAggregator(hre, await hre.ethers.getSigner(lendingDeployer), symbolPrices);

  const symbolToAggregatorAddresses = {} as { [symbol: string]: string };

  for (const symbol of Object.keys(symbolPrices)) {
    const priceAggregatorName = getTestPriceAggregatorNameFromSymbol(hre, symbol);
    const priceAggregatorDeployedResult = await hre.deployments.get(priceAggregatorName);
    symbolToAggregatorAddresses[symbol] = priceAggregatorDeployedResult.address;
  }

  const { address: aaveOracleAddress } = await hre.deployments.get(ORACLE_ID);

  const aaveOracleContract = await hre.ethers.getContractAt("AaveOracle", aaveOracleAddress, await hre.ethers.getSigner(lendingDeployer));

  const assetAddresses = [];
  const aggregatorAddresses = [];

  for (const [symbol, aggregatorAddress] of Object.entries(symbolToAggregatorAddresses)) {
    assetAddresses.push(symbolAddresses[symbol]);
    aggregatorAddresses.push(aggregatorAddress);
  }

  await aaveOracleContract.setAssetSources(assetAddresses, aggregatorAddresses);

  console.log("Successfully set new asset sources");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
