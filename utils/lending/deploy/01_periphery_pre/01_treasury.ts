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
  // Check if deployment already exists to ensure idempotency
  const existingProxy = await hre.deployments.getOrNull(TREASURY_PROXY_ID);
  const existingController = await hre.deployments.getOrNull(TREASURY_CONTROLLER_ID);
  const existingImpl = await hre.deployments.getOrNull(TREASURY_IMPL_ID);

  if (existingProxy && existingController && existingImpl) {
    console.log("✅ Treasury contracts already deployed, skipping...");
    console.log(`  - Proxy: ${existingProxy.address}`);
    console.log(`  - Controller: ${existingController.address}`);
    console.log(`  - Implementation: ${existingImpl.address}`);
    return true;
  }
  // Deploy Treasury proxy (if not exists)
  let treasuryProxyDeployedResult;
  if (!existingProxy) {
    treasuryProxyDeployedResult = await deployContract(
      hre,
      TREASURY_PROXY_ID,
      [],
      undefined, // auto-filled gas limit
      deployer,
      undefined, // no library
      "InitializableAdminUpgradeabilityProxy", // The actual contract name
    );
    console.log(`  ✅ Treasury proxy deployed: ${treasuryProxyDeployedResult.address}`);
  } else {
    treasuryProxyDeployedResult = { address: existingProxy.address };
    console.log(`  ✅ Treasury proxy already exists: ${existingProxy.address}`);
  }

  // Deploy Treasury Controller (if not exists)
  let treasuryControllerDeployedResult;
  if (!existingController) {
    treasuryControllerDeployedResult = await deployContract(
      hre,
      TREASURY_CONTROLLER_ID,
      [treasuryOwner.address],
      undefined, // auto-filled gas limit
      deployer,
      undefined, // no library
      "AaveEcosystemReserveController", // The actual contract name
    );
    console.log(`  ✅ Treasury controller deployed: ${treasuryControllerDeployedResult.address}`);
  } else {
    treasuryControllerDeployedResult = { address: existingController.address };
    console.log(`  ✅ Treasury controller already exists: ${existingController.address}`);
  }

  // Deploy Treasury implementation (if not exists)
  let treasuryImplDeployedResult;
  if (!existingImpl) {
    treasuryImplDeployedResult = await deployContract(
      hre,
      TREASURY_IMPL_ID,
      [],
      undefined, // auto-filled gas limit
      deployer,
      undefined, // no library
      "AaveEcosystemReserveV2", // The actual contract name
    );
    console.log(`  ✅ Treasury implementation deployed: ${treasuryImplDeployedResult.address}`);
  } else {
    treasuryImplDeployedResult = { address: existingImpl.address };
    console.log(`  ✅ Treasury implementation already exists: ${existingImpl.address}`);
  }

  // Check if proxy is already initialized to avoid re-initialization
  const proxy = await hre.ethers.getContractAt(
    "InitializableAdminUpgradeabilityProxy",
    treasuryProxyDeployedResult.address,
  );

  let isProxyInitialized = false;
  try {
    // Check if proxy has been initialized by trying to get the implementation
    const implementation = await proxy.implementation();
    isProxyInitialized = implementation !== "0x0000000000000000000000000000000000000000";
  } catch (error) {
    // If call fails, proxy might not be initialized
    isProxyInitialized = false;
  }

  const treasuryImplContract = await hre.ethers.getContractAt(
    "AaveEcosystemReserveV2",
    treasuryImplDeployedResult.address,
  );

  // Initialize implementation contract if it's newly deployed
  if (!existingImpl) {
    console.log(`-----------------`);
    console.log(
      `Initialize AaveEcosystemReserveV2 Impl at ${treasuryImplDeployedResult.address}`,
    );

    try {
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
    } catch (error) {
      if (error instanceof Error && error.message.includes("Already initialized")) {
        console.log("  - Implementation already initialized");
        console.log(`-----------------`);
      } else {
        throw error;
      }
    }
  } else {
    console.log(`-----------------`);
    console.log(`Implementation already exists and initialized`);
    console.log(`-----------------`);
  }

  // Initialize proxy if not already initialized
  if (!isProxyInitialized) {
    console.log(
      `Initialize Treasury InitializableAdminUpgradeabilityProxy at ${treasuryProxyDeployedResult.address}`,
    );

    const initializePayload = treasuryImplContract.interface.encodeFunctionData(
      "initialize",
      [treasuryControllerDeployedResult.address],
    );

    try {
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
    } catch (error) {
      if (error instanceof Error && (error.message.includes("Already initialized") || error.message.includes("initialized"))) {
        console.log("  - Proxy already initialized");
        console.log(`-----------------`);
      } else {
        throw error;
      }
    }
  } else {
    console.log(
      `Proxy at ${treasuryProxyDeployedResult.address} already initialized, skipping`,
    );
    console.log(`-----------------`);
  }

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
