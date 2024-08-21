import { getBlockTimestamp, increaseTime, waitForTx } from "@aave/deploy-v3";
import { BigNumberish } from "ethers";

import { makeSuite, TestEnv } from "../helpers/make-suite";
import { CompareRules } from "./helpers/comparator-engine";
import { getNormalizedDistribution } from "./helpers/ray-math";
import {
  AssetUpdateDataV2,
  getRewardsData,
  RewardData,
  rewardsDataComparator,
} from "./helpers/RewardsDistributor/data-helpers/asset-data";

const { expect } = require("chai");

makeSuite(
  "AaveIncentivesController V2 depositFundFromUser",
  async (testEnv: TestEnv) => {
    it("Configure assets", async () => {
      const {
        rewardsController,
        stakedAave,
        rewardToken,
        stakedTokenStrategy,
        pullRewardsStrategy,
        aDaiMockV2,
        aWethMockV2,
      } = testEnv;

      const time = await getBlockTimestamp();
      const assetsConfig = [
        {
          emissionPerSecond: "33",
          totalSupply: "100000",
          distributionEnd: time + 2000 * 60 * 60,
          reward: stakedAave.address,
        },
        {
          emissionPerSecond: "22",
          totalSupply: "200000",
          distributionEnd: time + 3000 * 60 * 60,
          reward: rewardToken.address,
        },
      ];
      const customTimeMovement = time + 1000 * 60 * 60;
      const compareRules: CompareRules<AssetUpdateDataV2, RewardData> = {
        fieldsEqualToInput: ["emissionPerSecond", "distributionEnd"],
      };

      const deployedAssets = [aDaiMockV2, aWethMockV2];

      const rewardStrategy = {
        [stakedAave.address]: stakedTokenStrategy.address,
        [rewardToken.address]: pullRewardsStrategy.address,
      };

      const assets: string[] = [];
      const assetsEmissions: BigNumberish[] = [];
      const assetConfigsUpdate: AssetUpdateDataV2[] = [];

      for (let i = 0; i < assetsConfig.length; i++) {
        const { emissionPerSecond, totalSupply, reward, distributionEnd } =
          assetsConfig[i];

        if (i > deployedAssets.length) {
          throw new Error("to many assets to test");
        }

        // Change current supply
        await waitForTx(
          await deployedAssets[i].setUserBalanceAndSupply("0", totalSupply),
        );

        // Push configs
        assets.push(deployedAssets[i].address);
        assetsEmissions.push(emissionPerSecond);
        assetConfigsUpdate.push({
          emissionPerSecond,
          totalSupply,
          reward,
          rewardOracle: testEnv.oracle.address,
          distributionEnd,
          asset: deployedAssets[i].address,
          transferStrategy: rewardStrategy[reward],
        });
      }

      const assetsConfigBefore = await getRewardsData(
        rewardsController,
        assetConfigsUpdate.map(({ asset }) => asset),
        assetConfigsUpdate.map(({ reward }) => reward),
      );

      // Perform action
      const action = await rewardsController.configureAssets(
        assetConfigsUpdate,
      );
      const txReceipt = await waitForTx(action);

      // Assert action output
      const allRewards = await rewardsController.getRewardsList();
      const configsUpdateBlockTimestamp = await getBlockTimestamp(
        txReceipt.blockNumber,
      );
      const assetsConfigAfter = await getRewardsData(
        rewardsController,
        assetConfigsUpdate.map(({ asset }) => asset),
        assetConfigsUpdate.map(({ reward }) => reward),
      );
      const eventsEmitted = txReceipt.events || [];

      let eventArrayIndex = 0;

      expect(allRewards.length).to.gte(0);
      expect(allRewards).to.have.members(
        assetConfigsUpdate.map(({ reward }) => reward),
      );

      // Check installation events
      for (let i = 0; i < assetsConfigBefore.length; i++) {
        // Check TransferStrategy installation event
        await expect(action)
          .to.emit(rewardsController, "TransferStrategyInstalled")
          .withArgs(
            assetConfigsUpdate[i].reward,
            assetConfigsUpdate[i].transferStrategy,
          );
        eventArrayIndex += 1;
      }

      // Check Assets events
      for (let i = 0; i < assetsConfigBefore.length; i++) {
        const assetConfigBefore = assetsConfigBefore[i];
        const assetConfigUpdateInput = assetConfigsUpdate[i];
        const assetConfigAfter = assetsConfigAfter[i];

        const rewardsList = await rewardsController.getRewardsByAsset(
          assetConfigUpdateInput.asset,
        );
        expect(rewardsList.length).to.gte(0);
        expect(rewardsList).to.include(assetConfigUpdateInput.reward);

        // Check Asset Configuration
        await expect(
          await rewardsController.getDistributionEnd(
            assetConfigAfter.underlyingAsset,
            assetConfigsUpdate[i].reward,
          ),
        ).to.be.eq(assetsConfig[i].distributionEnd);

        await expect(action)
          .to.emit(rewardsController, "AssetConfigUpdated")
          .withArgs(
            assetConfigAfter.underlyingAsset,
            assetConfigsUpdate[i].reward,
            0,
            assetConfigAfter.emissionPerSecond,
            0,
            assetConfigAfter.distributionEnd,
            assetConfigAfter.index,
          );

        eventArrayIndex += 1;

        await expect(action)
          .to.emit(rewardsController, "RewardOracleUpdated")
          .withArgs(
            assetConfigsUpdate[i].reward,
            assetConfigsUpdate[i].rewardOracle,
          );

        eventArrayIndex += 1;

        await rewardsDataComparator(
          assetConfigUpdateInput,
          assetConfigBefore,
          assetConfigAfter,
          configsUpdateBlockTimestamp,
          compareRules || {},
        );
      }
      expect(eventsEmitted[eventArrayIndex]).to.be.equal(
        undefined,
        "Too many events emitted",
      );

      // Check Rewards config
      for (let i = 0; i < allRewards.length; i++) {
        const contractReward = allRewards[i];
        const oracle = await rewardsController.getRewardOracle(allRewards[i]);
        const strategy = await rewardsController.getTransferStrategy(
          allRewards[i],
        );

        expect(oracle).to.be.eq(testEnv.oracle.address);
        expect(strategy).to.be.eq(rewardStrategy[contractReward]);
      }
    });

    it("Tries to deposit fund to staked token strategy", async () => {
      const { stakedAave, emissionManager, users, aDaiMockV2 } = testEnv;
      await expect(
        emissionManager
          .connect(users[2].signer)
          .depositReward(aDaiMockV2.address, stakedAave.address, 10),
      ).to.be.revertedWith(
        "ONLY_ALLOW_DEPOSIT_TO_PULL_REWARDS_TRANSFER_STRATEGY",
      );
    });

    it("Tries to deposit fund with zero amount", async () => {
      const { rewardsController, emissionManager, users, aDaiMockV2 } = testEnv;
      const rewardsList = await rewardsController.getRewardsByAsset(
        aDaiMockV2.address,
      );
      expect(rewardsList.length).to.gte(0);
      await expect(
        emissionManager
          .connect(users[2].signer)
          .depositReward(aDaiMockV2.address, rewardsList[0], 0),
      ).to.be.revertedWith("ZERO_AMOUNT");
    });

    it("Tries to call depositFundFrom directly by ordinary user", async () => {
      const {
        rewardsController,
        rewardToken,
        rewardsVault,
        users,
        aDaiMockV2,
      } = testEnv;
      const rewardsList = await rewardsController.getRewardsByAsset(
        aDaiMockV2.address,
      );
      expect(rewardsList.length).to.gte(0);
      await rewardToken
        .connect(rewardsVault.signer)
        .transfer(users[2].address, 10);
      await rewardToken
        .connect(users[2].signer)
        .approve(rewardsController.address, 10);
      await expect(
        rewardsController
          .connect(users[2].signer)
          .depositFundFrom(
            aDaiMockV2.address,
            rewardsList[0],
            10,
            users[2].address,
          ),
      ).to.be.revertedWith("ONLY_EMISSION_MANAGER");
    });

    it("Tries to deposit fund to non-whitelisted reward", async () => {
      const { emissionManager, users, aDaiMockV2 } = testEnv;
      await expect(
        emissionManager
          .connect(users[2].signer)
          .depositReward(aDaiMockV2.address, aDaiMockV2.address, 100),
      ).to.be.revertedWith("ONLY_ALLOW_DEPOSIT_TO_ENABLED_REWARD");
    });

    it("EmissionManager updates the emission per second of distributions after deposit new reward successfully", async () => {
      const {
        rewardsVault,
        emissionManager,
        users,
        rewardsController,
        rewardToken,
        aWethMockV2,
      } = testEnv;

      await rewardToken
        .connect(rewardsVault.signer)
        .transfer(users[2].address, 10);
      await rewardToken
        .connect(users[2].signer)
        .approve(rewardsController.address, 10);
      const depositAction = await emissionManager
        .connect(users[2].signer)
        .depositReward(aWethMockV2.address, rewardToken.address, 10);
      const depositTx = await waitForTx(depositAction);

      const assetsConfig = [
        {
          asset: aWethMockV2,
          reward: rewardToken,
          newEmissionPerSecond: "22",
          totalSupply: "10000",
        },
      ];

      for (let i = 0; i < assetsConfig.length; i++) {
        const [assetDataBefore] = await getRewardsData(
          rewardsController,
          [assetsConfig[i].asset.address],
          [assetsConfig[i].reward.address],
        );

        const configsUpdateBlockTimestamp = await getBlockTimestamp(
          depositTx.blockNumber,
        );

        const expectedIndex = getNormalizedDistribution(
          assetsConfig[i].totalSupply,
          assetDataBefore.index,
          assetDataBefore.emissionPerSecond,
          assetDataBefore.lastUpdateTimestamp,
          configsUpdateBlockTimestamp,
          assetDataBefore.distributionEnd,
        );

        expect(depositAction)
          .to.emit(rewardsController, "AssetConfigUpdated")
          .withArgs(
            assetsConfig[i].asset.address,
            assetsConfig[i].reward.address,
            assetDataBefore.emissionPerSecond,
            assetsConfig[i].newEmissionPerSecond,
            assetDataBefore.distributionEnd,
            assetDataBefore.distributionEnd,
            expectedIndex.toString(10),
          );

        const [assetDataAfter] = await getRewardsData(
          rewardsController,
          [assetsConfig[i].asset.address],
          [assetsConfig[i].reward.address],
        );

        expect(assetDataAfter.index.toString()).to.be.eq(
          expectedIndex.toString(10),
        );
        expect(assetDataAfter.distributionEnd).to.be.eq(
          assetDataBefore.distributionEnd,
        );
        expect(assetDataAfter.emissionPerSecond).to.be.eq(
          assetsConfig[i].newEmissionPerSecond,
        );
        expect(assetDataAfter.lastUpdateTimestamp).to.be.eq(
          configsUpdateBlockTimestamp,
        );
      }
    });
  },
);
