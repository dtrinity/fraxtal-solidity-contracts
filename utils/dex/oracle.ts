import { BigNumberish } from "ethers";
import hre from "hardhat";

import { ORACLE_ID } from "../lending/deploy-ids";
import { UNISWAP_STATIC_ORACLE_WRAPPER_ID } from "./deploy-ids";

/**
 * Get the price of an asset from the static oracle
 *
 * @param callerAddress The address of the caller
 * @param tokenAddress The address of the token to get price for
 * @returns The price of the asset with 8 decimals
 */
export async function getStaticOraclePrice(
  callerAddress: string,
  tokenAddress: string,
): Promise<BigNumberish> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const oracleDeployedResult = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );
  const oracleContract = await hre.ethers.getContractAt(
    "StaticOracleWrapper",
    oracleDeployedResult.address,
    signer,
  );

  const price = await oracleContract.getAssetPrice(tokenAddress);

  return price;
}

/**
 * Get the price of an asset from the Aave oracle
 *
 * @param callerAddress The address of the caller
 * @param tokenAddress The address of the token to get price for
 * @returns The price of the asset with 8 decimals
 */
export async function getOraclePrice(
  callerAddress: string,
  tokenAddress: string,
): Promise<BigNumberish> {
  const oracleDeployedResult = await hre.deployments.get(ORACLE_ID);
  const oracleContract = await hre.ethers.getContractAt(
    "AaveOracle",
    oracleDeployedResult.address,
    await hre.ethers.getSigner(callerAddress),
  );

  return await oracleContract.getAssetPrice(tokenAddress);
}
