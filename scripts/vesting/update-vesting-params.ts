import hre from "hardhat";
import { ERC20_VESTING_NFT_ID } from "../../typescript/deploy-ids";
import { getConfig } from "../../config/config";

async function main() {
  const { deployments, ethers } = hre;

  const [deployer] = await ethers.getSigners();

  const network = hre.network.name;

  const config = await getConfig(hre);
  const vestingConfig = config.vesting;

  if (!vestingConfig) {
    throw new Error("Vesting config not found for fraxtal_testnet");
  }

  const vestingDeployment = await deployments.get(ERC20_VESTING_NFT_ID);
  const vestingContract = await ethers.getContractAt(
    "ERC20VestingNFT",
    vestingDeployment.address,
    deployer,
  );

  console.log("Updating vesting contract parameters...");

  console.log(`Updating maxTotalSupply to ${vestingConfig.maxTotalSupply}...`);
  const tx1 = await vestingContract.setMaxTotalSupply(
    vestingConfig.maxTotalSupply,
  );
  console.log(`Transaction hash: ${tx1.hash}`);
  await tx1.wait();
  console.log("setMaxTotalSupply successful.");

  console.log(
    `Updating minDepositAmount to ${vestingConfig.minDepositThreshold}...`,
  );
  const tx2 = await vestingContract.setMinDepositAmount(
    vestingConfig.minDepositThreshold,
  );
  console.log(`Transaction hash: ${tx2.hash}`);
  await tx2.wait();
  console.log("setMinDepositAmount successful.");

  console.log("Vesting contract parameters updated successfully.");

  const newMaxTotalSupply = await vestingContract.maxTotalSupply();
  const newMinDepositAmount = await vestingContract.minDepositAmount();

  console.log(`New maxTotalSupply: ${newMaxTotalSupply.toString()}`);
  console.log(`New minDepositAmount: ${newMinDepositAmount.toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
