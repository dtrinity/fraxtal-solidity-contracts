import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../config/config";
import { TEST_WETH9_ID } from "./dex/deploy-ids";
import { isLocalNetwork } from "./utils";

/**
 * Get the WETH9 address
 *
 * @param hre - Hardhat Runtime Environment
 * @returns The WETH9 address
 */
export async function getWETH9Address(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  if (isLocalNetwork(hre.network.name)) {
    const { address: weth9Address } = await hre.deployments.get(TEST_WETH9_ID);
    return weth9Address;
  }

  const config = await getConfig(hre);
  return config.dex.weth9Address;
}
