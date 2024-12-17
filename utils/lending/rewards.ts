import { BigNumberish, MaxUint256 } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  EMISSION_MANAGER_ID,
  INCENTIVES_PROXY_ID,
  INCENTIVES_PULL_REWARDS_STRATEGY_ID,
  ORACLE_ID,
} from "./deploy-ids";
import { getBlockTimestamp } from "./utils";

type AssetRequestUpdateData = {
  emissionPerSecond: BigNumberish;
  totalSupply: BigNumberish;
  distributionEnd: BigNumberish;
  asset: string;
  reward: string;
  rewardOracle: string;
  transferStrategy: string;
};

type RewardsData = {
  index: BigNumberish;
  emissionPerSecond: BigNumberish;
  lastUpdateTimestamp: BigNumberish;
  distributionEnd: BigNumberish;
  underlyingAsset: string;
  reward: string;
};

export type AssetUpdateData = {
  emissionPerSecond: BigNumberish;
  distributionEnd: BigNumberish; // timestamp
  asset: string;
  reward: string;
};

/**
 * Configures the assets for the emission manager.
 *
 * @param hre - The Hardhat runtime environment.
 * @param assets - The assets to configure.
 */
export const configureAssets = async (
  hre: HardhatRuntimeEnvironment,
  assets: AssetUpdateData[],
): Promise<void> => {
  // TODO: Remove this once we integrate incentive management with admin tool
  const {
    lendingIncentivesEmissionManager,
    lendingPoolAdmin,
    lendingIncentivesRewardsVault,
  } = await hre.getNamedAccounts();
  const admin = await hre.ethers.getSigner(lendingPoolAdmin);
  const signer = await hre.ethers.getSigner(lendingIncentivesEmissionManager);
  const vaultOwner = await hre.ethers.getSigner(lendingIncentivesRewardsVault);

  const { address: aaveOracleAddress } = await hre.deployments.get(ORACLE_ID);
  const { address: pullRewardTransferStrategyAddress } =
    await hre.deployments.get(INCENTIVES_PULL_REWARDS_STRATEGY_ID);
  const { address: controllerAddress } =
    await hre.deployments.get(INCENTIVES_PROXY_ID);
  const controller = await hre.ethers.getContractAt(
    "RewardsController",
    controllerAddress,
    signer,
  );

  assets = (
    await Promise.all(
      assets.map(async (asset) => {
        const incentivedToken = await hre.ethers.getContractAt(
          "IncentivizedERC20",
          asset.asset,
          admin,
        );

        const tokenIncentiveController =
          await incentivedToken.getIncentivesController();

        if (tokenIncentiveController !== controllerAddress) {
          console.log(
            `Setting incentive controller for ${asset.asset} to ${controllerAddress}`,
          );
          const tx =
            await incentivedToken.setIncentivesController(controllerAddress);
          await tx.wait(1);
          console.log(
            `Incentive controller for ${asset.asset} set to ${controllerAddress}`,
          );
        }

        const reward = await hre.ethers.getContractAt(
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function decimals() view returns (uint8)",
          ],
          asset.reward,
          vaultOwner,
        );

        const rewardDecimals = await reward.decimals();
        asset.emissionPerSecond = hre.ethers.parseUnits(
          asset.emissionPerSecond.toString(),
          rewardDecimals,
        );

        const currentAllowance = await reward.allowance(
          vaultOwner.address,
          pullRewardTransferStrategyAddress,
        );

        if (currentAllowance < MaxUint256) {
          const tx = await reward.approve(
            pullRewardTransferStrategyAddress,
            MaxUint256,
          );
          console.log(
            "Approving PullRewardTransferStrategry contract at",
            pullRewardTransferStrategyAddress,
            "to transfer",
            asset.reward,
            "in future when user is claiming their rewards from the vault",
            vaultOwner.address,
          );
          await tx.wait(1);
        }

        return asset;
      }),
    )
  ).filter((asset): asset is AssetUpdateData => asset !== undefined);

  const updateData = assets.map((asset) => {
    return {
      emissionPerSecond: asset.emissionPerSecond,
      totalSupply: 0, // The total supply of the asset is always updated by the onchain supply
      distributionEnd: asset.distributionEnd,
      asset: asset.asset,
      reward: asset.reward,
      rewardOracle: aaveOracleAddress,
      transferStrategy: pullRewardTransferStrategyAddress,
    } as AssetRequestUpdateData;
  });

  const { address: managerAddress } =
    await hre.deployments.get(EMISSION_MANAGER_ID);
  const emissionManager = await hre.ethers.getContractAt(
    "EmissionManager",
    managerAddress,
    signer,
  );

  const tx = await emissionManager.configureAssets(updateData);
  const txReceipt = await tx.wait(1);
  console.log("Assets configured!");

  const allRewards = await controller.getRewardsList();
  const configsUpdateBlockTimestamp = await getBlockTimestamp(
    hre,
    txReceipt?.blockNumber,
  );
  console.log("allRewards", allRewards);
  console.log("Configs update block timestamp", configsUpdateBlockTimestamp);
};

/**
 * Retrieves the emission admin for a given reward token.
 *
 * @param hre - The Hardhat runtime environment.
 * @param reward - The address of the reward token.
 * @returns A promise that resolves to the address of the emission admin.
 */
export const getEmissionAdmin = async (
  hre: HardhatRuntimeEnvironment,
  reward: string,
): Promise<string> => {
  const { lendingIncentivesEmissionManager } = await hre.getNamedAccounts();
  const owner = await hre.ethers.getSigner(lendingIncentivesEmissionManager);
  const { address: managerAddress } =
    await hre.deployments.get(EMISSION_MANAGER_ID);
  const emissionManager = await hre.ethers.getContractAt(
    "EmissionManager",
    managerAddress,
    owner,
  );
  return await emissionManager.getEmissionAdmin(reward);
};

/**
 * Sets the emission admin for a given reward token to the lendingIncentivesEmissionManager.
 *
 * @param hre - The Hardhat runtime environment.
 * @param reward - The address of the reward token.
 */
export const setEmissionAdminToOwner = async (
  hre: HardhatRuntimeEnvironment,
  reward: string,
): Promise<void> => {
  const { lendingIncentivesEmissionManager } = await hre.getNamedAccounts();
  const owner = await hre.ethers.getSigner(lendingIncentivesEmissionManager);
  const { address: managerAddress } =
    await hre.deployments.get(EMISSION_MANAGER_ID);
  const emissionManager = await hre.ethers.getContractAt(
    "EmissionManager",
    managerAddress,
    owner,
  );
  await emissionManager.setEmissionAdmin(
    reward,
    lendingIncentivesEmissionManager,
  );
  console.log(
    `New emission admin for ${reward} is`,
    await getEmissionAdmin(hre, reward),
  );
};

/**
 * Retrieves the rewards data for a given asset and reward token.
 *
 * @param hre - The Hardhat runtime environment.
 * @param assets - The addresses of the underlying assets.
 * @param rewards - The addresses of the reward tokens.
 * @returns A promise that resolves to an array of rewards data.
 */
export const getRewardsData = async (
  hre: HardhatRuntimeEnvironment,
  assets: string[],
  rewards: string[],
): Promise<RewardsData[]> => {
  const { lendingIncentivesEmissionManager } = await hre.getNamedAccounts();
  const owner = await hre.ethers.getSigner(lendingIncentivesEmissionManager);
  const { address: controllerAddress } =
    await hre.deployments.get(INCENTIVES_PROXY_ID);
  const controller = await hre.ethers.getContractAt(
    "RewardsController",
    controllerAddress,
    owner,
  );

  return await Promise.all(
    assets.map(async (underlyingAsset, i) => {
      const response = await controller.getRewardsData(
        underlyingAsset,
        rewards[i],
      );

      return {
        index: response[0],
        emissionPerSecond: response[1],
        lastUpdateTimestamp: response[2],
        distributionEnd: response[3],
        underlyingAsset,
        reward: rewards[i],
      };
    }),
  );
};
