import hrer from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../config/config";
import { TEST_WETH9_ID } from "../dex/deploy-ids";
import { fetchTokenInfo } from "../token";
import { getTokenAddresses } from "../token-registry";
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
    // Use the token registry for local networks
    const tokenAddresses = await getTokenAddresses(hre);
    
    // Special case for WFRXETH on local networks
    // We need to return WFRXETH so that we can open a market for it
    const wfrxethDeployment = await hre.deployments.getOrNull(TEST_WETH9_ID);
    if (wfrxethDeployment) {
      tokenAddresses["WFRXETH"] = wfrxethDeployment.address;
    }

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
