import { BigNumber } from "@ethersproject/bignumber";
import axios from "axios";
import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { getReservesList } from "../../lending/pool";
import { batchProcessing, isLocalNetwork } from "../../utils";
import { GraphParams, GraphReturnType, User } from "../shared/types";
import { getMaxLiquidationAmount } from "../shared/utils";
import { getUserReserveInfo, UserReserveInfo } from "../shared/utils.run";

/**
 * Get all users in the Lending Pool for Curve liquidation
 *
 * @returns All user addresses
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

  if (!config.liquidatorBotCurve) {
    throw new Error("Liquidator bot Curve config is not found");
  }

  const graphUrl = config.liquidatorBotCurve.graphConfig.url;

  if (graphUrl.length < 10) {
    throw Error("Invalid graph URL: " + graphUrl);
  }

  const batchSize = config.liquidatorBotCurve.graphConfig.batchSize;

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

/**
 * Get the user liquidation parameters for Curve
 *
 * @param userAddress - Address of the user
 * @returns The user liquidation parameters
 */
export async function getUserLiquidationParams(userAddress: string): Promise<{
  userAddress: string;
  collateralToken: UserReserveInfo;
  debtToken: UserReserveInfo;
  toLiquidateAmount: BigNumber;
}> {
  const config = await getConfig(hre);

  if (!config.liquidatorBotCurve) {
    throw new Error("Liquidator bot Curve config is not found");
  }

  const reserveAddresses = await getReservesList();

  const reserveInfos: UserReserveInfo[] = await batchProcessing(
    reserveAddresses,
    config.liquidatorBotCurve.reserveBatchSize,
    (reserveAddress) => getUserReserveInfo(userAddress, reserveAddress),
    false,
  );

  const availableDebtMarkets = reserveInfos.filter((r) => r.borrowingEnabled);
  const [debtMarket] = availableDebtMarkets.sort((a, b) =>
    a.totalDebt.gt(b.totalDebt) ? -1 : 1,
  );

  const availableCollateralMarkets = reserveInfos.filter(
    (r) => r.usageAsCollateralEnabled,
  );
  const [collateralMarket] = availableCollateralMarkets
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
