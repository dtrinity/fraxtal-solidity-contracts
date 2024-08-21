import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import axios from "axios";
import hre from "hardhat";

import { getConfig } from "../../config/config";
import { AAVE_ORACLE_USD_DECIMALS } from "../constants";
import { getStaticOraclePrice } from "../dex/oracle";
import { getUserDebtBalance, getUserSupplyBalance } from "../lending/balance";
import { getReservesList } from "../lending/pool";
import { getReserveConfigurationData } from "../lending/reserve";
import { fetchTokenInfo, TokenInfo } from "../token";
import { batchedPromiseAll, isLocalNetwork } from "../utils";
import { getLiquidationProfitInUSD, getMaxLiquidationAmount } from "./utils";

export interface User {
  id: string;
}
export type GraphReturnType<T> = { data: { data?: T; errors?: object } };
export type GraphParams = { query: string; variables: object };

/**
 * Get all users in the Lenting Pool
 *
 * @returns - All users in the Lending Pool
 */
export async function getAllLendingUserAddresses(): Promise<string[]> {
  if (isLocalNetwork(hre.network.name)) {
    const {
      dexDeployer,
      lendingDeployer,
      testAccount1,
      testAccount2,
      testAccount3,
    } = await hre.getNamedAccounts();
    return [
      dexDeployer,
      lendingDeployer,
      testAccount1,
      testAccount2,
      testAccount3,
    ];
  }

  const config = await getConfig(hre);
  const graphUrl = config.liquidatorBot.graphConfig.url;

  if (graphUrl.length < 10) {
    throw Error("Invalid graph URL: " + graphUrl);
  }

  const batchSize = config.liquidatorBot.graphConfig.batchSize;

  if (batchSize < 1) {
    throw Error("Invalid batch size: " + batchSize);
  }

  const query = `query GetAccounts($first: Int, $lastId: ID){
    accounts(
        first: $first, 
        where: { id_gt: $lastId } 
        orderBy: id, 
        orderDirection: asc
    ) {
  id
}
}`;

  let lastId = "";

  const allUsers: string[] = [];

  while (true) {
    const result = await axios
      .post<
        GraphParams,
        GraphReturnType<{ accounts: Omit<User, "isBorrower">[] }>
      >(graphUrl, {
        query: query,
        variables: { lastId, first: batchSize },
      })
      .then((r) => {
        if (r.data.errors) throw Error(JSON.stringify(r.data.errors));
        if (!r.data.data) throw Error("Unknown graph error");
        return r.data.data;
      });
    const users = result.accounts.map((u) => u.id);
    allUsers.push(...users);

    if (result.accounts.length === 0) {
      break;
    }

    lastId = result.accounts[result.accounts.length - 1].id;
  }
  return allUsers;
}

export interface UserReserveInfo {
  userAddress: string;
  reserveAddress: string;
  totalSupply: BigNumber;
  totalDebt: BigNumber;
  priceInUSD: BigNumberish;
  priceDecimals: number;
  reserveTokenInfo: TokenInfo;
  liquidationBonus: BigNumber;
}

/**
 * Get the user reserve information
 *
 * @param userAddress - The address of the user
 * @param reserveAddress - The address of the reserve
 * @returns - The user reserve information
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
    { liquidationBonus },
  ] = await Promise.all([
    getUserSupplyBalance(reserveAddress, userAddress),
    getUserDebtBalance(reserveAddress, userAddress),
    getStaticOraclePrice(liquidatorBotDeployer, reserveAddress),
    fetchTokenInfo(hre, reserveAddress),
    getReserveConfigurationData(reserveAddress),
  ]);

  // Assume we always use the StaticOracle for the price
  const priceDecimals = AAVE_ORACLE_USD_DECIMALS;

  return {
    userAddress: userAddress,
    reserveAddress: reserveAddress,
    totalSupply: totalSupply,
    totalDebt: totalDebt,
    priceInUSD: priceInUSD,
    priceDecimals: priceDecimals,
    reserveTokenInfo: reserveTokenInfo,
    liquidationBonus: BigNumber.from(liquidationBonus),
  };
}

/**
 * Get the user liquidation parameters
 *
 * @param userAddress - The address of the user
 * @returns - The user liquidation parameters
 */
export async function getUserLiquidationParams(userAddress: string): Promise<{
  userAddress: string;
  collateralToken: UserReserveInfo;
  debtToken: UserReserveInfo;
  toLiquidateAmount: BigNumber;
}> {
  const config = await getConfig(hre);
  const reserveAddresses = await getReservesList();

  const reserveInfos = await batchedPromiseAll(
    reserveAddresses.map((reserveAddress) =>
      getUserReserveInfo(userAddress, reserveAddress),
    ),
    config.liquidatorBot.reserveBatchSize,
  );

  const [debtMarket] = reserveInfos.sort((a, b) =>
    a.totalDebt.gt(b.totalDebt) ? -1 : 1,
  );

  const [collateralMarket] = reserveInfos
    .filter((b) => b.liquidationBonus.gt(0))
    .sort((a, b) => (a.totalSupply.gt(b.totalSupply) ? -1 : 1));

  const { liquidatorBotDeployer } = await hre.getNamedAccounts();
  const maxLiquidationAmount = await getMaxLiquidationAmount(
    collateralMarket.reserveTokenInfo,
    debtMarket.reserveTokenInfo,
    userAddress,
    liquidatorBotDeployer,
  );

  return {
    userAddress,
    collateralToken: collateralMarket,
    debtToken: debtMarket,
    toLiquidateAmount: maxLiquidationAmount.toLiquidateAmount,
  };
}

/**
 * Check if the liquidation is profitable
 *
 * @param debtToken - The debt token information
 * @param toLiquidateAmount - The amount to liquidate
 * @returns - Whether the liquidation is profitable
 */
export async function isProfitable(
  debtToken: UserReserveInfo,
  toLiquidateAmount: BigNumber,
): Promise<boolean> {
  const config = await getConfig(hre);
  const liquidationProfit = await getLiquidationProfitInUSD(
    debtToken.reserveTokenInfo,
    {
      rawValue: BigNumber.from(debtToken.priceInUSD),
      decimals: debtToken.priceDecimals,
    },
    toLiquidateAmount.toBigInt(),
  );

  if (liquidationProfit < config.liquidatorBot.profitableThresholdInUSD) {
    return false;
  }
  return true;
}
