import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import {
  TREASURY_CONTROLLER_ID,
  TREASURY_IMPL_ID,
  TREASURY_PROXY_ID,
} from "../../../../utils/lending/deploy-ids";

/**
 * Deploy the Treasury contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/01_periphery_pre/01_treasury.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param treasuryOwner - The owner of the Treasury contract
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployTreasury(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  treasuryOwner: HardhatEthersSigner,
): Promise<boolean> {
  // Deploy Treasury proxy
  const treasuryProxyDeployedResult = await deployContract(
    hre,
    TREASURY_PROXY_ID,
    [],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "InitializableAdminUpgradeabilityProxy", // The actual contract name
  );

  // Deploy Treasury Controller
  const treasuryControllerDeployedResult = await deployContract(
    hre,
    TREASURY_CONTROLLER_ID,
    [treasuryOwner.address],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "AaveEcosystemReserveController", // The actual contract name
  );

  // Deploy Treasury implementation and initialize proxy
  const treasuryImplDeployedResult = await deployContract(
    hre,
    TREASURY_IMPL_ID,
    [],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "AaveEcosystemReserveV2", // The actual contract name
  );

  console.log(`-----------------`);
  console.log(
    `Initialize AaveEcosystemReserveV2 Impl at ${treasuryProxyDeployedResult.address}`,
  );

  // Call to initialize at implementation contract to prevent other calls.
  const treasuryImplContract = await hre.ethers.getContractAt(
    "AaveEcosystemReserveV2",
    treasuryImplDeployedResult.address,
    // deployer,
  );

  // Claim the implementation contract so no one else can claim it
  // Note that we will only ever use this contract if there are funds accidentally
  // sent to the implementation instead of the proxy
  const treasuryImplResponse =
    await treasuryImplContract.initialize(treasuryOwner);
  const treasuryImplReceipt = await treasuryImplResponse.wait();
  console.log(`  - TxHash: ${treasuryImplReceipt?.hash}`);
  console.log(`  - From: ${treasuryImplReceipt?.from}`);
  console.log(`  - GasUsed: ${treasuryImplReceipt?.gasUsed.toString()}`);
  console.log(`-----------------`);

  // Initialize proxy
  console.log(
    `Initialize Treasury InitializableAdminUpgradeabilityProxy at ${treasuryProxyDeployedResult.address}`,
  );
  const proxy = await hre.ethers.getContractAt(
    "InitializableAdminUpgradeabilityProxy",
    treasuryProxyDeployedResult.address,
    // deployer,
  );
  const initializePayload = treasuryImplContract.interface.encodeFunctionData(
    "initialize",
    [treasuryControllerDeployedResult.address],
  );
  const initProxyResponse = await proxy["initialize(address,address,bytes)"](
    treasuryImplDeployedResult.address,
    treasuryOwner,
    initializePayload,
  );
  const initProxyReceipt = await initProxyResponse.wait();
  console.log(`  - TxHash: ${initProxyReceipt?.hash}`);
  console.log(`  - From: ${initProxyReceipt?.from}`);
  console.log(`  - GasUsed: ${initProxyReceipt?.gasUsed.toString()}`);
  console.log(`-----------------`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
