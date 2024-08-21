import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  ATOKEN_PREFIX,
  STABLE_DEBT_PREFIX,
  VARIABLE_DEBT_PREFIX,
} from "./deploy-ids";

/**
 * Save the pool tokens to the deployments folder
 *
 * @param hre - Hardhat Runtime Environment
 * @param reservesConfig - Reserve token symbols and their addresses
 * @param dataProviderAddress - The address of the data provider contract
 */
export async function savePoolTokens(
  hre: HardhatRuntimeEnvironment,
  reservesConfig: { [token: string]: string },
  dataProviderAddress: string,
): Promise<void> {
  const dataProviderContract = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    dataProviderAddress,
  );

  const aTokenArtifact = await hre.deployments.getExtendedArtifact("AToken");
  const variableDebtTokenArtifact =
    await hre.deployments.getExtendedArtifact("VariableDebtToken");
  const stableDebtTokenArtifact =
    await hre.deployments.getExtendedArtifact("StableDebtToken");

  for (const tokenSymbol in reservesConfig) {
    const { aTokenAddress, variableDebtTokenAddress, stableDebtTokenAddress } =
      await dataProviderContract.getReserveTokensAddresses(
        reservesConfig[tokenSymbol],
      );

    await hre.deployments.save(`${tokenSymbol}${ATOKEN_PREFIX}`, {
      address: aTokenAddress,
      ...aTokenArtifact,
    });
    await hre.deployments.save(`${tokenSymbol}${VARIABLE_DEBT_PREFIX}`, {
      address: variableDebtTokenAddress,
      ...variableDebtTokenArtifact,
    });
    await hre.deployments.save(`${tokenSymbol}${STABLE_DEBT_PREFIX}`, {
      address: stableDebtTokenAddress,
      ...stableDebtTokenArtifact,
    });
  }
}
