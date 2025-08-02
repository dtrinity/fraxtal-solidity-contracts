import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../config/config";
import { getTokenRegistry, TokenDeploymentStrategy } from "../token-registry";
import { isLocalNetwork, isTestnetNetwork } from "../utils";

/**
 * Get the deployment name of the Mocked Chainlink oracle for testing of the token
 *
 * @param hre - Hardhat Runtime Environment
 * @param symbol - The symbol of the token
 * @returns The deployment name of the Mocked Chainlink oracle for testing of the token
 */
export function getTestPriceAggregatorNameFromSymbol(
  hre: HardhatRuntimeEnvironment,
  symbol: string,
): string {
  if (
    !isLocalNetwork(hre.network.name) &&
    !isTestnetNetwork(hre.network.name)
  ) {
    throw new Error(
      `Mocked Chainlink oracles are not available on ${hre.network.name} network`,
    );
  }
  return `${symbol}-MockPriceAggregator`;
}

/**
 * Get the addresses of the Mocked Chainlink oracles for testing
 *
 * @param hre - Hardhat Runtime Environment
 * @returns - The addresses of the Mocked Chainlink oracles for testing
 */
export async function getChainlinkOracles(
  hre: HardhatRuntimeEnvironment,
): Promise<{
  [symbol: string]: string;
}> {
  const config = await getConfig(hre);

  if (isLocalNetwork(hre.network.name)) {
    const registry = await getTokenRegistry(hre);
    const mintedTestTokens = Object.values(registry.tokens)
      .filter(token => token.strategy === TokenDeploymentStrategy.MINT)
      .map(token => token.symbol);
    
    const mockOracleTokens = config.lending.mockPriceAggregatorInitialUSDPrices;

    if (!mockOracleTokens) {
      throw new Error(
        `Mock oracle tokens not found in the configuration for network ${hre.network.name}`,
      );
    }

    const res = {} as { [symbol: string]: string };

    for (const symbol of mintedTestTokens) {
      if (symbol in mockOracleTokens) {
        const priceAggregatorName = getTestPriceAggregatorNameFromSymbol(
          hre,
          symbol,
        );
        const priceAggregatorDeployedResult =
          await hre.deployments.get(priceAggregatorName);
        res[symbol] = priceAggregatorDeployedResult.address;
      }
    }
    return res;
  }

  if (config.lending.chainlinkAggregatorAddresses === undefined) {
    throw new Error(
      `Chainlink aggregator addresses not found in the configuration for network ${hre.network.name}`,
    );
  }

  return config.lending.chainlinkAggregatorAddresses;
}

/**
 * Get the assets and sources for the pairs token aggregator
 *
 * @param reserveAddresses - The mapping of the reserve symbols to their addresses
 * @param priceAggregatorAddresses - The mapping of the reserve symbols to their price aggregator addresses
 * @returns - The assets and sources for the pairs token aggregator
 */
export function getPairsTokenAggregator(
  reserveAddresses: { [symbol: string]: string },
  priceAggregatorAddresses: { [symbol: string]: string },
): {
  assets: string[];
  sources: string[];
} {
  // Make sure the reserveAddresses and priceAggregatorAddresses have the same keys
  const reserveSymbols = Object.keys(reserveAddresses);

  // Get the assets and sources for each symbol
  const assets: string[] = [];
  const sources: string[] = [];

  // Get the assets and sources for each symbol
  for (const symbol of reserveSymbols) {
    if (priceAggregatorAddresses[symbol]) {
      assets.push(reserveAddresses[symbol]);
      sources.push(priceAggregatorAddresses[symbol]);
    }
  }

  return { assets, sources };
}
