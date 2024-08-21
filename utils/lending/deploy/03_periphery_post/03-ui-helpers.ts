import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../../../config/config";
import { deployContract } from "../../../deploy";

/**
 * Deploy the UiPoolDataProvider contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/03_periphery_post/03-ui-helpers.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployUiPoolDataProvider(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const config = await getConfig(hre);

  if (!config.lending.chainlinkEthUsdAggregatorProxy) {
    console.log(
      '[Deployments] Skipping the deployment of UiPoolDataProvider due missing constant "chainlinkEthUsdAggregatorProxy" configuration',
    );
    return false;
  }

  // Deploy UiIncentiveDataProvider getter helper
  await deployContract(
    hre,
    "UiIncentiveDataProviderV3",
    [],
    undefined, // auto-filled gas limit,
    deployer,
  );

  // Deploy UiPoolDataProvider getter helper
  await deployContract(
    hre,
    "UiPoolDataProviderV3",
    [
      config.lending.chainlinkEthUsdAggregatorProxy,
      config.lending.chainlinkEthUsdAggregatorProxy,
    ],
    undefined, // auto-filled gas limit,
    deployer,
  );

  return true;
}
