import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";

/**
 * Deploy the WalletBalanceProvider contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/03_periphery_post/02_wallet_balance_provider.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployWalletBalanceProvider(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  await deployContract(
    hre,
    "WalletBalanceProvider",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
