import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../../../config/config";
import { deployContract } from "../../../deploy";
import { POOL_ADDRESSES_PROVIDER_ID, POOL_PROXY_ID } from "../../deploy-ids";

/**
 * Deploy all the Curve adapters contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/03_periphery_post/04_paraswap_adapters.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployCurveAdapters(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const { address: providerAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const { address: poolAddress } = await hre.deployments.get(POOL_PROXY_ID);

  const { curve } = await getConfig(hre);

  if (!curve.router) {
    throw new Error("Curve router not found");
  }

  const { lendingPoolAdmin } = await hre.getNamedAccounts();

  await deployContract(
    hre,
    "CurveDebtSwapAdapter",
    [providerAddress, poolAddress, curve.router, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "CurveLiquiditySwapAdapter",
    [providerAddress, poolAddress, curve.router, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "CurveRepayAdapter",
    [providerAddress, poolAddress, curve.router, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "CurveWithdrawSwapAdapter",
    [providerAddress, poolAddress, curve.router, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  return true;
}
