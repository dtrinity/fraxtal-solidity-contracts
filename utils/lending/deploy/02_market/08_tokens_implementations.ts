import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import {
  ATOKEN_IMPL_ID,
  DELEGATION_AWARE_ATOKEN_IMPL_ID,
  POOL_ADDRESSES_PROVIDER_ID,
  STABLE_DEBT_TOKEN_IMPL_ID,
  VARIABLE_DEBT_TOKEN_IMPL_ID,
} from "../../../../utils/lending/deploy-ids";

/**
 * Deploy the Tokens Implementations
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/08_tokens_implementations.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployTokensImplementations(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const { address: addressesProviderAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const addressesProviderDeployedResult = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProviderAddress,
    // deployer
  );

  const poolAddress = await addressesProviderDeployedResult.getPool();

  const aTokenDeployedResult = await deployContract(
    hre,
    ATOKEN_IMPL_ID,
    [poolAddress],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "AToken", // The actual contract name
  );

  const aTokenContract = await hre.ethers.getContractAt(
    "AToken",
    aTokenDeployedResult.address,
  );

  console.log(`------------------------`);
  console.log(`Initialize AToken implementation`);
  console.log(`  - AToken implementation: ${aTokenDeployedResult.address}`);
  console.log(`  - Pool Address         : ${poolAddress}`);

  try {
    const initATokenResponse = await aTokenContract.initialize(
      poolAddress, // initializingPool
      ZeroAddress, // treasury
      ZeroAddress, // underlyingAsset
      ZeroAddress, // incentivesController
      0, // aTokenDecimals
      "ATOKEN_IMPL", // aTokenName
      "ATOKEN_IMPL", // aTokenSymbol
      "0x00", // params
    );
    const initATokenReceipt = await initATokenResponse.wait();
    console.log(`  - TxHash  : ${initATokenReceipt?.hash}`);
    console.log(`  - From    : ${initATokenReceipt?.from}`);
    console.log(`  - GasUsed : ${initATokenReceipt?.gasUsed.toString()}`);
  } catch (error: any) {
    // Contract instance has already been initialized
    if (
      error?.message.includes("Contract instance has already been initialized")
    ) {
      console.log(`  - Already initialized`);
    } else {
      throw Error(`Failed to initialize AToken implementation: ${error}`);
    }
  }

  console.log(`------------------------`);

  const delegationAwareATokenDeployedResult = await deployContract(
    hre,
    DELEGATION_AWARE_ATOKEN_IMPL_ID,
    [poolAddress],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "DelegationAwareAToken", // The actual contract name
  );

  const delegationAwareATokenContract = await hre.ethers.getContractAt(
    "DelegationAwareAToken",
    delegationAwareATokenDeployedResult.address,
  );

  console.log(`------------------------`);
  console.log(`Initialize DelegationAwareAToken implementation`);
  console.log(
    `  - DelegationAwareAToken implementation: ${delegationAwareATokenDeployedResult.address}`,
  );
  console.log(`  - Pool Address                      : ${poolAddress}`);

  try {
    const initDelegationAwareATokenResponse =
      await delegationAwareATokenContract.initialize(
        poolAddress, // initializingPool
        ZeroAddress, // treasury
        ZeroAddress, // underlyingAsset
        ZeroAddress, // incentivesController
        0, // aTokenDecimals
        "DELEGATION_AWARE_ATOKEN_IMPL", // aTokenName
        "DELEGATION_AWARE_ATOKEN_IMPL", // aTokenSymbol
        "0x00", // params
      );
    const initDelegationAwareATokenReceipt =
      await initDelegationAwareATokenResponse.wait();
    console.log(`  - TxHash  : ${initDelegationAwareATokenReceipt?.hash}`);
    console.log(`  - From    : ${initDelegationAwareATokenReceipt?.from}`);
    console.log(
      `  - GasUsed : ${initDelegationAwareATokenReceipt?.gasUsed.toString()}`,
    );
  } catch (error: any) {
    // Contract instance has already been initialized
    if (
      error?.message.includes("Contract instance has already been initialized")
    ) {
      console.log(`  - Already initialized`);
    } else {
      throw Error(
        `Failed to initialize DelegationAwareAToken implementation: ${error}`,
      );
    }
  }
  console.log(`------------------------`);

  const stableDebtTokenDeployedResult = await deployContract(
    hre,
    STABLE_DEBT_TOKEN_IMPL_ID,
    [poolAddress],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "StableDebtToken", // The actual contract name
  );

  const stableDebtTokenContract = await hre.ethers.getContractAt(
    "StableDebtToken",
    stableDebtTokenDeployedResult.address,
  );

  console.log(`------------------------`);
  console.log(`Initialize StableDebtToken implementation`);
  console.log(
    `  - StableDebtToken implementation: ${stableDebtTokenDeployedResult.address}`,
  );
  console.log(`  - Pool Address                  : ${poolAddress}`);

  try {
    const initStableDebtTokenResponse =
      await stableDebtTokenContract.initialize(
        poolAddress, // initializingPool
        ZeroAddress, // underlyingAsset
        ZeroAddress, // incentivesController
        0, // debtTokenDecimals
        "STABLE_DEBT_TOKEN_IMPL", // debtTokenName
        "STABLE_DEBT_TOKEN_IMPL", // debtTokenSymbol
        "0x00", // params
      );
    const initStableDebtTokenReceipt = await initStableDebtTokenResponse.wait();
    console.log(`  - TxHash  : ${initStableDebtTokenReceipt?.hash}`);
    console.log(`  - From    : ${initStableDebtTokenReceipt?.from}`);
    console.log(
      `  - GasUsed : ${initStableDebtTokenReceipt?.gasUsed.toString()}`,
    );
  } catch (error: any) {
    // Contract instance has already been initialized
    if (
      error?.message.includes("Contract instance has already been initialized")
    ) {
      console.log(`  - Already initialized`);
    } else {
      throw Error(
        `Failed to initialize StableDebtToken implementation: ${error}`,
      );
    }
  }

  console.log(`------------------------`);

  const variableDebtTokenDeployedResult = await deployContract(
    hre,
    VARIABLE_DEBT_TOKEN_IMPL_ID,
    [poolAddress],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "VariableDebtToken", // The actual contract name
  );

  const variableDebtTokenContract = await hre.ethers.getContractAt(
    "VariableDebtToken",
    variableDebtTokenDeployedResult.address,
  );

  console.log(`------------------------`);
  console.log(`Initialize VariableDebtToken implementation`);
  console.log(
    `  - VariableDebtToken implementation: ${variableDebtTokenDeployedResult.address}`,
  );
  console.log(`  - Pool Address                    : ${poolAddress}`);

  try {
    const initVariableDebtTokenResponse =
      await variableDebtTokenContract.initialize(
        poolAddress, // initializingPool
        ZeroAddress, // underlyingAsset
        ZeroAddress, // incentivesController
        0, // debtTokenDecimals
        "VARIABLE_DEBT_TOKEN_IMPL", // debtTokenName
        "VARIABLE_DEBT_TOKEN_IMPL", // debtTokenSymbol
        "0x00", // params
      );
    const initVariableDebtTokenReceipt =
      await initVariableDebtTokenResponse.wait();
    console.log(`  - TxHash  : ${initVariableDebtTokenReceipt?.hash}`);
    console.log(`  - From    : ${initVariableDebtTokenReceipt?.from}`);
    console.log(
      `  - GasUsed : ${initVariableDebtTokenReceipt?.gasUsed.toString()}`,
    );
  } catch (error: any) {
    // Contract instance has already been initialized
    if (
      error?.message.includes("Contract instance has already been initialized")
    ) {
      console.log(`  - Already initialized`);
    } else {
      throw Error(
        `Failed to initialize VariableDebtToken implementation: ${error}`,
      );
    }
  }

  console.log(`------------------------`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
