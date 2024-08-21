import BigNumber from "bignumber.js";
import { Wallet } from "ethers";
import hre from "hardhat";

import {
  EMISSION_MANAGER_ID,
  INCENTIVES_PROXY_ID,
} from "../../../utils/lending/deploy-ids";

const main = async (): Promise<void> => {
  const reward = process.env.reward;
  const privateKey = process.env.privateKey;
  const amount = process.env.amount;

  if (!reward || !privateKey || !amount || isNaN(parseFloat(amount))) {
    throw new Error(
      "Invalid input. Please provide reward address, wallet private key, and amount.",
    );
  }

  if (new BigNumber(amount).isLessThan(0)) {
    throw new Error("Amount must be greater than 0");
  }

  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(hre.ethers.provider);
  const rewardToken = await hre.ethers.getContractAt(
    "IERC20Detailed",
    reward,
    signer,
  );
  const amountBN = hre.ethers.parseUnits(
    amount.toString(),
    await rewardToken.decimals(),
  );

  const { address: managerAddress } =
    await hre.deployments.get(EMISSION_MANAGER_ID);
  const emissionManager = await hre.ethers.getContractAt(
    "EmissionManager",
    managerAddress,
    signer,
  );
  const { address: controllerAddress } =
    await hre.deployments.get(INCENTIVES_PROXY_ID);
  const { lendingIncentivesRewardsVault } = await hre.getNamedAccounts();

  console.log(
    "Vault balance before",
    await rewardToken.balanceOf(lendingIncentivesRewardsVault),
  );

  console.log("Approving controller to transfer tokens");
  const tx = await rewardToken.approve(controllerAddress, amountBN.toString());
  const response = await tx.wait();
  console.log("Approved tx hash", response?.hash);

  console.log("Depositing funds to controller");
  const depositTx = await emissionManager.depositReward(
    reward,
    amountBN.toString(),
  );
  const depositResponse = await depositTx.wait();
  console.log("Deposit tx hash", depositResponse?.hash);
  console.log("User balance", await rewardToken.balanceOf(wallet.address));
  console.log(
    "Current vault balance",
    await rewardToken.balanceOf(lendingIncentivesRewardsVault),
  );
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
