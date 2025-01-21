import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import hre from "hardhat";

import { AAVE_ORACLE_USD_DECIMALS } from "../../constants";
import { getOraclePrice } from "../../dex/oracle";
import {
  getUserDebtBalance,
  getUserSupplyBalance,
} from "../../lending/balance";
import { getReserveConfigurationData } from "../../lending/reserve";
import { fetchTokenInfo, TokenInfo } from "../../token";

export interface UserReserveInfo {
  userAddress: string;
  reserveAddress: string;
  totalSupply: BigNumber;
  totalDebt: BigNumber;
  priceInUSD: BigNumberish;
  priceDecimals: number;
  reserveTokenInfo: TokenInfo;
  liquidationBonus: BigNumber;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
}

/**
 * Get the user reserve information
 *
 * @param userAddress - Address of the user
 * @param reserveAddress - Address of the reserve
 * @returns The user reserve information
 */
export async function getUserReserveInfo(
  userAddress: string,
  reserveAddress: string,
): Promise<UserReserveInfo> {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();
  const [
    totalSupply,
    totalDebt,
    priceInUSD,
    reserveTokenInfo,
    { liquidationBonus, usageAsCollateralEnabled, borrowingEnabled },
  ] = await Promise.all([
    getUserSupplyBalance(reserveAddress, userAddress),
    getUserDebtBalance(reserveAddress, userAddress),
    getOraclePrice(liquidatorBotDeployer, reserveAddress),
    fetchTokenInfo(hre, reserveAddress),
    getReserveConfigurationData(reserveAddress),
  ]);

  return {
    userAddress,
    reserveAddress,
    totalSupply,
    totalDebt,
    priceInUSD,
    priceDecimals: AAVE_ORACLE_USD_DECIMALS,
    reserveTokenInfo,
    liquidationBonus: BigNumber.from(liquidationBonus),
    usageAsCollateralEnabled,
    borrowingEnabled,
  };
}
