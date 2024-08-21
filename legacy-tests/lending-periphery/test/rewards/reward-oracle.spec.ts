import { waitForTx, ZERO_ADDRESS } from "@aave/deploy-v3";

import { makeSuite, TestEnv } from "../helpers/make-suite";

const { expect } = require("chai");

makeSuite(
  "AaveIncentivesControllerV2 reward oracle tests",
  (testEnv: TestEnv) => {
    it("Gets the reward oracle from configureAssets", async () => {
      const {
        rewardsController,
        aDaiMockV2,
        rewardToken,
        distributionEnd,
        pullRewardsStrategy,
        oracle,
      } = testEnv;

      // Configure asset
      await waitForTx(
        await rewardsController.configureAssets([
          {
            asset: aDaiMockV2.address,
            reward: rewardToken.address,
            rewardOracle: oracle.address,
            emissionPerSecond: 100,
            distributionEnd,
            totalSupply: "0",
            transferStrategy: pullRewardsStrategy.address,
          },
        ]),
      );

      // Retrieve reward oracle
      const configuredOracle = await rewardsController.getRewardOracle(
        rewardToken.address,
      );
      expect(configuredOracle).equals(oracle.address);
    });

    it("Update the reward oracle with emission manager", async () => {
      const { rewardsController, oracle, rewardToken } = testEnv;
      await waitForTx(
        await rewardsController.setRewardOracle(
          rewardToken.address,
          oracle.address,
        ),
      );
      const configuredOracle = await rewardsController.getRewardOracle(
        rewardToken.address,
      );
      expect(configuredOracle).equals(oracle);
    });

    it("Revert due update the reward oracle from non admin account", async () => {
      const { rewardsController, users } = testEnv;
      await expect(
        rewardsController
          .connect(users[2].signer)
          .setRewardOracle(ZERO_ADDRESS, ZERO_ADDRESS),
      ).be.revertedWith("ONLY_EMISSION_MANAGER");
    });
  },
);
