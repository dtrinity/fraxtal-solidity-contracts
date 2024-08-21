import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../deploy";
import { isLocalNetwork, isTestnetNetwork } from "../utils";
import { getTestPriceAggregatorNameFromSymbol } from "./oracle";

/**
 * Deploy the test price aggregator for each token
 * - Assume that the Token was deployed and logged in the ./deployments/test-token/ folder
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/00_testnet/01_price_aggregators_setup.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - Hardhat Ethers Signer
 * @param prices - Prices of each token (in USD)
 */
export async function deployTestPriceAggregator(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  prices: { [symbol: string]: number },
): Promise<void> {
  if (
    !isLocalNetwork(hre.network.name) &&
    !isTestnetNetwork(hre.network.name)
  ) {
    throw new Error(
      `Mocked Chainlink oracles MUST NOT BE DEPLOYED on ${hre.network.name}`,
    );
  }

  for (const symbol of Object.keys(prices)) {
    const price = prices[symbol];
    const rawOnChainPriceWith8Decimals = hre.ethers.parseUnits(
      price.toString(),
      8,
    );
    const priceAggregatorName = getTestPriceAggregatorNameFromSymbol(
      hre,
      symbol,
    );

    await deployContract(
      hre,
      priceAggregatorName,
      [rawOnChainPriceWith8Decimals],
      undefined, // auto-filled gas limit
      deployer,
      undefined, // no library
      "MockAggregator", // The actual contract name
    );
  }
}
