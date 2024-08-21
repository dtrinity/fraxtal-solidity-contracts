import hrer from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../config/config";
import { TEST_WETH9_ID } from "../dex/deploy-ids";
import { fetchTokenInfo } from "../token";
import { isLocalNetwork } from "../utils";
import { POOL_DATA_PROVIDER_ID } from "./deploy-ids";

/**
 * Get the reserve token addresses
 *
 * @param hre - Hardhat Runtime Environment
 * @returns  The reserve token addresses
 */
export async function getReserveTokenAddresses(
  hre: HardhatRuntimeEnvironment,
): Promise<{
  [symbol: string]: string;
}> {
  const config = await getConfig(hre);

  if (isLocalNetwork(hre.network.name)) {
    // Get the token addresses from the deployments
    if (!config.mintInfos) {
      throw new Error(
        `Mint infos not found in the configuration for network ${hre.network.name}`,
      );
    }

    const mintInfos = config.mintInfos;
    const tokenAddresses: { [symbol: string]: string } = {};

    for (let symbol of Object.keys(mintInfos)) {
      const tokenAddress = (await hre.deployments.get(symbol)).address;

      if (tokenAddress === undefined) {
        throw new Error(`Token address not found for ${symbol}`);
      }
      tokenAddresses[symbol] = tokenAddress;
    }
    // Special case for local, since we don't use an existing WETH9 deployment
    // But we need to return WFRXETH so that we can open a market for it
    tokenAddresses["WFRXETH"] = (
      await hre.deployments.get(TEST_WETH9_ID)
    ).address;
    console.log("Constructed token addresses: ", tokenAddresses);
    return tokenAddresses;
  }

  if (config.lending.reserveAssetAddresses === undefined) {
    throw new Error(
      `Reserve asset addresses not found in the configuration for network ${hre.network.name}`,
    );
  }

  return config.lending.reserveAssetAddresses;
}

/**
 * Get the reserve tokens addresses from the address
 *
 * @param underlyingTokenAddress - The address of the underlying token
 * @returns The reserve token addresses
 */
export async function getReserveTokensAddressesFromAddress(
  underlyingTokenAddress: string,
): Promise<{
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  stableDebtTokenAddress: string;
}> {
  const dataProviderDeployment = await hrer.deployments.get(
    POOL_DATA_PROVIDER_ID,
  );
  const dataProviderContract = await hrer.ethers.getContractAt(
    "AaveProtocolDataProvider",
    dataProviderDeployment.address,
  );

  const borrowTokenInfo = await fetchTokenInfo(hrer, underlyingTokenAddress);

  const { aTokenAddress, variableDebtTokenAddress, stableDebtTokenAddress } =
    await dataProviderContract.getReserveTokensAddresses(
      borrowTokenInfo.address,
    );

  return {
    aTokenAddress,
    variableDebtTokenAddress,
    stableDebtTokenAddress,
  };
}

/**
 * Get the AToken contract's address
 * - The contract name is `AToken`
 *
 * @param assetAddress - The address of the asset
 * @returns - The AToken contract's address
 */
export async function getATokenContractAddress(
  assetAddress: string,
): Promise<string> {
  const { aTokenAddress } =
    await getReserveTokensAddressesFromAddress(assetAddress);
  return aTokenAddress;
}
