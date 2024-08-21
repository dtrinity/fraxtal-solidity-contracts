import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../deploy";
import { SWAP_ROUTER_ID } from "../../../dex/deploy-ids";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../deploy-ids";

/**
 * Deploy all the DSwap adapters contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/03_periphery_post/04_paraswap_adapters.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployDSwapAdapters(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const { address: providerAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);

  const { lendingPoolAdmin } = await hre.getNamedAccounts();

  await deployContract(
    hre,
    "DSwapLiquiditySwapAdapter",
    [providerAddress, routerAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "DSwapWithdrawSwapAdapter",
    [providerAddress, routerAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "DSwapRepayAdapter",
    [providerAddress, routerAddress, lendingPoolAdmin],
    undefined, // auto-filled gas limit
    deployer,
  );

  return true;
}
