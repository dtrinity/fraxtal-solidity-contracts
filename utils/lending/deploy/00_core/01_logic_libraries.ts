import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";

/**
 * Deploy the logic libraries for the lending pool
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/00_core/00_markets_registry.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployLogicLibraries(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  await deployContract(
    hre,
    "SupplyLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  const borrowLogicArtifact = await deployContract(
    hre,
    "BorrowLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "LiquidationLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "EModeLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "BridgeLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "ConfiguratorLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  await deployContract(
    hre,
    "FlashLoanLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
    {
      BorrowLogic: borrowLogicArtifact.address.toString(),
    },
  );

  await deployContract(
    hre,
    "PoolLogic",
    [],
    undefined, // auto-filled gas limit
    deployer,
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
