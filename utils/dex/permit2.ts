import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../config/config";
import { isLocalNetwork } from "../utils";
import { UNISWAP_PERMIT2_ID } from "./deploy-ids";

/**
 * Get the Permit2 contract address
 *
 * @param hre - Hardhat Runtime Environment
 * @returns The permit2 address
 */
export async function getPermit2Address(
  hre: HardhatRuntimeEnvironment,
): Promise<string> {
  if (isLocalNetwork(hre.network.name)) {
    const { address: permit2Address } =
      await hre.deployments.get(UNISWAP_PERMIT2_ID);
    return permit2Address;
  }

  const config = await getConfig(hre);

  if (config.dex.permit2Address != "") {
    return config.dex.permit2Address;
  }

  throw new Error("Permit2 address is not set in the config");
}
