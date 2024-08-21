import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../deploy";
import { isLocalNetwork, isTestnetNetwork } from "../../../utils";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../deploy-ids";

/**
 * Deploy the Mock Flash Loan Receiver contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/10_init_periphery.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployMockFlashLoanReceiver(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  if (
    !isLocalNetwork(hre.network.name) &&
    !isTestnetNetwork(hre.network.name)
  ) {
    throw new Error(
      `The network ${hre.network.name} is not supported for this deployment script. Please use hardhat, localhost, or a testnet networks.`,
    );
  }

  // Deploy Mock Flash Loan Receiver if testnet deployment
  await deployContract(
    hre,
    "MockFlashLoanReceiver",
    [(await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID)).address],
    undefined, // auto-filled gas limit
    deployer,
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
