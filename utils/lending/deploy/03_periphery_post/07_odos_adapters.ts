import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../../../config/config";
import { deployContract } from "../../../deploy";
import { POOL_ADDRESSES_PROVIDER_ID, POOL_PROXY_ID } from "../../deploy-ids";

/**
 * Deploy all the Odos adapters contract
 * - Similar pattern as Curve adapters
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployOdosAdapters(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const { address: providerAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const { address: poolAddress } = await hre.deployments.get(POOL_PROXY_ID);
  const config = await getConfig(hre);

  // Get the Odos router address from environment variables
  const odosRouterAddress = config.odos?.router;

  if (!odosRouterAddress) {
    console.log("Skip: Odos router not found in configuration");
    return false;
  }

  const { lendingPoolAdmin } = await hre.getNamedAccounts();

  console.log("Deploying Odos Adapters with the following addresses:");
  console.log("- PoolAddressesProvider:", providerAddress);
  console.log("- Pool:", poolAddress);
  console.log("- OdosRouterV2:", odosRouterAddress);
  console.log("- Owner:", lendingPoolAdmin);

  await deployContract(
    hre,
    "OdosLiquiditySwapAdapter",
    [providerAddress, poolAddress, odosRouterAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "OdosDebtSwapAdapter",
    [providerAddress, poolAddress, odosRouterAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "OdosRepayAdapter",
    [providerAddress, poolAddress, odosRouterAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "OdosWithdrawSwapAdapter",
    [providerAddress, poolAddress, odosRouterAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  return true;
}
