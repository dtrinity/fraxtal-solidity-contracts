import { HardhatRuntimeEnvironment } from "hardhat/types";

import { AaveOracle, PoolAddressesProviderRegistry, StaticOracleWrapper } from "../../../typechain-types";
import { deployContract } from "../../../utils/deploy";
import { ORACLE_ID } from "../../../utils/lending/deploy-ids";

const REGISTRY_CONTRACT_NAME = "PoolAddressesProviderRegistry";

/**
 * Deploy the lending contracts
 *
 * @param hre - Hardhat Runtime Environment
 * @param staticOracleWrapper - The static oracle wrapper
 * @returns The oracle and the pool addresses provider registry
 */
export async function deployLending(
  hre: HardhatRuntimeEnvironment,
  staticOracleWrapper: StaticOracleWrapper,
): Promise<{
  oracle: AaveOracle;
  poolAddressesProviderRegistry: PoolAddressesProviderRegistry;
}> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const poolAddressesProviderRegistryDeployedResult = await deployContract(
    hre,
    REGISTRY_CONTRACT_NAME,
    [deployer.address],
    undefined, // auto-filled gas limit
    deployer,
  );

  const oracleResult = await deployContract(
    hre,
    ORACLE_ID,
    [
      poolAddressesProviderRegistryDeployedResult.address.toString(),
      [], // No chainlink aggregators and reserve assets to use the fallbackOracleAddress
      [],
      await staticOracleWrapper.getAddress(), // fallbackOracleAddress
      await staticOracleWrapper.BASE_CURRENCY(),
      await staticOracleWrapper.BASE_CURRENCY_UNIT(),
    ],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "AaveOracle",
  );

  return {
    oracle: await hre.ethers.getContractAt("AaveOracle", oracleResult.address, deployer),
    poolAddressesProviderRegistry: await hre.ethers.getContractAt(
      REGISTRY_CONTRACT_NAME,
      poolAddressesProviderRegistryDeployedResult.address,
      deployer,
    ),
  };
}
