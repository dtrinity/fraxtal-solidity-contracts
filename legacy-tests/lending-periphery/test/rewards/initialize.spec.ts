import { ZERO_ADDRESS } from "@aave/deploy-v3";

import { makeSuite, TestEnv } from "../helpers/make-suite";

const { expect } = require("chai");

makeSuite("AaveIncentivesControllerV2 initialize", (testEnv: TestEnv) => {
  it("Tries to call initialize second time, should be reverted", async () => {
    const { rewardsController } = testEnv;
    await expect(rewardsController.initialize(ZERO_ADDRESS)).to.be.reverted;
  });
});
