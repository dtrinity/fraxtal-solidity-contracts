import { BigNumber } from "@ethersproject/bignumber";
import hre from "hardhat";

import WadRayMath from "../maths/WadRayMath";
import { getPoolContractAddress } from "./pool";
import {
  getATokenContractAddress,
  getReserveTokensAddressesFromAddress,
} from "./token";

/**
 * Get the user supply balance of the asset
 * - Reference: https://github.com/stablyio/trinity-solidity-contracts/blob/a6672fbeea4cb7242d242dc19054819c103a0b8b/contracts/lending/core/protocol/libraries/logic/GenericLogic.sol#L282-L299
 *
 * @param assetAddress - The address of the asset
 * @param userAddress - The address of the user
 * @returns - The user supply balance of the asset
 */
export async function getUserSupplyBalance(
  assetAddress: string,
  userAddress: string,
): Promise<BigNumber> {
  const aTokenAddress = await getATokenContractAddress(assetAddress);
  const poolAddress = await getPoolContractAddress();

  const aTokenContract = await hre.ethers.getContractAt(
    "AToken",
    aTokenAddress,
    await hre.ethers.getSigner(userAddress),
  );
  const poolContract = await hre.ethers.getContractAt(
    "Pool",
    poolAddress,
    await hre.ethers.getSigner(userAddress),
  );

  const [normalizedIncome, scaleBalance] = await Promise.all([
    poolContract.getReserveNormalizedIncome(assetAddress),
    aTokenContract.scaledBalanceOf(userAddress),
  ]);

  return WadRayMath.rayMul(scaleBalance, normalizedIncome);
}

/**
 * Get the user debt balance of the asset
 * - Reference: https://github.com/stablyio/trinity-solidity-contracts/blob/a6672fbeea4cb7242d242dc19054819c103a0b8b/contracts/lending/core/protocol/libraries/logic/GenericLogic.sol#L247-L270
 *
 * @param assetAddress - The address of the asset
 * @param userAddress - The address of the user
 * @returns - The user debt balance of the asset
 */
export async function getUserDebtBalance(
  assetAddress: string,
  userAddress: string,
): Promise<BigNumber> {
  const { stableDebtTokenAddress, variableDebtTokenAddress } =
    await getReserveTokensAddressesFromAddress(assetAddress);
  const poolAddress = await getPoolContractAddress();

  const poolContract = await hre.ethers.getContractAt(
    "Pool",
    poolAddress,
    await hre.ethers.getSigner(userAddress),
  );

  const variableDebtTokenContract = await hre.ethers.getContractAt(
    "VariableDebtToken",
    variableDebtTokenAddress,
    await hre.ethers.getSigner(userAddress),
  );

  const userVariableDebt = await (async (): Promise<bigint> => {
    const scaledDebtBalance =
      await variableDebtTokenContract.scaledBalanceOf(userAddress);

    if (!BigNumber.from(scaledDebtBalance).isZero()) {
      const normalizeDebt =
        await poolContract.getReserveNormalizedVariableDebt(assetAddress);
      return WadRayMath.rayMul(scaledDebtBalance, normalizeDebt).toBigInt();
    }
    return scaledDebtBalance;
  })();

  const stableDebtTokenContract = await hre.ethers.getContractAt(
    "StableDebtToken",
    stableDebtTokenAddress,
    await hre.ethers.getSigner(userAddress),
  );

  const stableDebtBalance =
    await stableDebtTokenContract.balanceOf(userAddress);
  return BigNumber.from(userVariableDebt).add(stableDebtBalance);
}
