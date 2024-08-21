import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import {
  ORACLE_ID,
  POOL_ADDRESSES_PROVIDER_ID,
} from "../../../../utils/lending/deploy-ids";
import { getPairsTokenAggregator } from "../../../../utils/lending/oracle";

/**
 * Deploy the Oracle
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/04_deploy_oracles.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param reserveAssets - Reserve assets and their addresses
 * @param chainlinkAggregators - Chainlink aggregators' addresses for the reserve assets
 * @param fallbackOracleAddress - The fallback oracle address
 * @param baseCurrencyDecimals - The base currency decimals
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployOracles(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  reserveAssets: {
    [symbol: string]: string;
  },
  chainlinkAggregators: {
    [symbol: string]: string;
  },
  fallbackOracleAddress: string,
  baseCurrencyDecimals: number,
): Promise<boolean> {
  const { assets, sources } = getPairsTokenAggregator(
    reserveAssets,
    chainlinkAggregators,
  );

  if (!assets || !sources) {
    throw new Error("Invalid pairs of assets and sources");
  }

  if (assets.length !== sources.length) {
    throw new Error(
      `Invalid pairs of assets and sources: ${assets.length} !== ${sources.length}`,
    );
  }

  const { address: addressesProviderAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const USD_BASE_CURRENCY = ZeroAddress;

  // Deploy AaveOracle
  await deployContract(
    hre,
    ORACLE_ID,
    [
      addressesProviderAddress,
      assets,
      sources,
      fallbackOracleAddress,
      USD_BASE_CURRENCY,
      // BASE_CURRENCY_UNIT defines the price of the base currency relative to itself, so it's always 1
      hre.ethers.parseUnits("1", baseCurrencyDecimals),
    ],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "AaveOracle",
  );

  // Return true to indicate the script has been executed successfully.
  // It is to avoid running this script again (except using --reset flag).
  return true;
}
