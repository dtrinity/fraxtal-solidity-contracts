import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { ATOMIC_MARKET_LISTING_HELPER_ID } from "../../utils/lending/security-upgrade-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);

  const deployment = await hre.deployments.deploy(ATOMIC_MARKET_LISTING_HELPER_ID, {
    from: deployer.address,
    contract: "AtomicMarketListingHelper",
    args: [],
    autoMine: true,
    log: true,
    skipIfAlreadyDeployed: true,
  });

  const helper = await hre.ethers.getContractAt("AtomicMarketListingHelper", deployment.address, deployer);

  const desiredOwner = config.safeConfig?.safeAddress ?? config.walletAddresses.governanceMultisig;

  if (!desiredOwner) {
    return true;
  }

  const currentOwner = await helper.owner();

  if (currentOwner.toLowerCase() === desiredOwner.toLowerCase()) {
    return true;
  }

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.warn(
      `AtomicMarketListingHelper owner is ${currentOwner}; expected deployer ${deployer.address} or desired owner ${desiredOwner}. Skipping ownership transfer.`,
    );
    return false;
  }

  console.log("-----------------------------------");
  console.log("Transfer AtomicMarketListingHelper ownership");
  console.log(`  - Helper       : ${deployment.address}`);
  console.log(`  - Current owner: ${currentOwner}`);
  console.log(`  - New owner    : ${desiredOwner}`);
  const tx = await helper.transferOwnership(desiredOwner);
  const receipt = await tx.wait();
  console.log(`  - TxHash  : ${receipt?.hash}`);
  console.log(`  - From    : ${receipt?.from}`);
  console.log(`  - GasUsed : ${receipt?.gasUsed.toString()}`);
  console.log("-----------------------------------");

  return true;
};

func.id = "FraxtalLendingSecurityUpgrade:AtomicMarketListingHelper";
func.tags = ["lbp", "lbp-security-upgrade", "lbp-market-listing-helper"];
func.dependencies = ["lbp-market"];

export default func;
