import { BigNumber } from "ethers";

import { RewardsController } from "../../../../../types/RewardsController";

/**
 *
 * @param distributionManager
 * @param user
 * @param asset
 * @param reward
 */
export async function getUserIndex(
  distributionManager: RewardsController,
  user: string,
  asset: string,
  reward: string,
): Promise<BigNumber> {
  return await distributionManager.getUserAssetIndex(user, asset, reward);
}
