import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../utils/deploy";
import {
  DIRECTIONAL_ROUNDING_ATOKEN_IMPL_ID,
  DIRECTIONAL_ROUNDING_POOL_IMPL_ID,
  DIRECTIONAL_ROUNDING_UPGRADE_TAG,
  DIRECTIONAL_ROUNDING_VARIABLE_DEBT_TOKEN_IMPL_ID,
} from "../../utils/lending/directional-rounding-upgrade";
import { POOL_ADDRESSES_PROVIDER_ID, POOL_PROXY_ID } from "../../utils/lending/deploy-ids";
import { getPoolLibraries } from "../../utils/lending/utils";

async function initializeATokenImplementation(hre: HardhatRuntimeEnvironment, implementationAddress: string, poolAddress: string): Promise<void> {
  const aToken = await hre.ethers.getContractAt("AToken", implementationAddress);

  try {
    await (
      await aToken.initialize(
        poolAddress,
        ZeroAddress,
        ZeroAddress,
        ZeroAddress,
        0,
        "ATOKEN_IMPL",
        "ATOKEN_IMPL",
        "0x00",
      )
    ).wait();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Contract instance has already been initialized")) {
      throw error;
    }
  }
}

async function initializeVariableDebtImplementation(
  hre: HardhatRuntimeEnvironment,
  implementationAddress: string,
  poolAddress: string,
): Promise<void> {
  const variableDebtToken = await hre.ethers.getContractAt("VariableDebtToken", implementationAddress);

  try {
    await (
      await variableDebtToken.initialize(
        poolAddress,
        ZeroAddress,
        ZeroAddress,
        0,
        "VARIABLE_DEBT_TOKEN_IMPL",
        "VARIABLE_DEBT_TOKEN_IMPL",
        "0x00",
      )
    ).wait();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Contract instance has already been initialized")) {
      throw error;
    }
  }
}

async function initializePoolImplementation(
  hre: HardhatRuntimeEnvironment,
  implementationAddress: string,
  addressesProviderAddress: string,
): Promise<void> {
  const pool = await hre.ethers.getContractAt("Pool", implementationAddress);

  try {
    await (await pool.initialize(addressesProviderAddress)).wait();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Contract instance has already been initialized")) {
      throw error;
    }
  }
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);

  const { address: addressesProviderAddress } = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressesProvider = await hre.ethers.getContractAt("PoolAddressesProvider", addressesProviderAddress);
  const poolProxyAddress = await addressesProvider.getPool();

  if (poolProxyAddress === ZeroAddress) {
    throw new Error("Pool proxy is not initialized yet; run the base dLEND market deployment first");
  }

  const commonLibraries = await getPoolLibraries(hre);
  const calldataLogicLibrary = await hre.deployments.get("CalldataLogic");

  const poolDeployment = await deployContract(
    hre,
    DIRECTIONAL_ROUNDING_POOL_IMPL_ID,
    [addressesProviderAddress],
    undefined,
    deployer,
    {
      ...commonLibraries,
      CalldataLogic: calldataLogicLibrary.address,
    },
    "L2Pool",
  );
  await initializePoolImplementation(hre, String(poolDeployment.address), addressesProviderAddress);
  console.log(`  ✓ Directional rounding pool implementation ready at ${poolDeployment.address}`);

  const aTokenDeployment = await deployContract(
    hre,
    DIRECTIONAL_ROUNDING_ATOKEN_IMPL_ID,
    [poolProxyAddress],
    undefined,
    deployer,
    undefined,
    "AToken",
  );
  await initializeATokenImplementation(hre, String(aTokenDeployment.address), poolProxyAddress);
  console.log(`  ✓ Directional rounding AToken implementation ready at ${aTokenDeployment.address}`);

  const variableDebtDeployment = await deployContract(
    hre,
    DIRECTIONAL_ROUNDING_VARIABLE_DEBT_TOKEN_IMPL_ID,
    [poolProxyAddress],
    undefined,
    deployer,
    undefined,
    "VariableDebtToken",
  );
  await initializeVariableDebtImplementation(hre, String(variableDebtDeployment.address), poolProxyAddress);
  console.log(`  ✓ Directional rounding VariableDebtToken implementation ready at ${variableDebtDeployment.address}`);

  return true;
};

func.id = "dlend:minimal-directional-rounding:deploy-impls";
func.tags = [DIRECTIONAL_ROUNDING_UPGRADE_TAG, `${DIRECTIONAL_ROUNDING_UPGRADE_TAG}-deploy`];
func.dependencies = [POOL_ADDRESSES_PROVIDER_ID, POOL_PROXY_ID];

export default func;
