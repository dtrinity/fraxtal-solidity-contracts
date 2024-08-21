import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import { POOL_PROXY_ID } from "../../../../utils/lending/deploy-ids";

/**
 * Deploy the Native Token Gateway
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/03_periphery_post/01_native_token_gateway.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param wrappedNativeTokenAddress - The address of the Wrapped Native Token
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployNativeTokenGateway(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  wrappedNativeTokenAddress: string,
): Promise<boolean> {
  const { address: poolAddress } = await hre.deployments.get(POOL_PROXY_ID);

  await deployContract(
    hre,
    "WrappedTokenGatewayV3",
    [wrappedNativeTokenAddress, deployer.address, poolAddress],
    undefined, // auto-filled gas limit
    deployer,
  );

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
