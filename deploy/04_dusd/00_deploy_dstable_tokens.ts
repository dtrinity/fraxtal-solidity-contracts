import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployTestERC20StablecoinUpgradeableTokens } from "../../utils/token.stablecoin";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("Skipping dStable token deployment on non-local network");
    return true;
  }

  const { testTokenDeployer } = await hre.getNamedAccounts();

  console.log("Starting dStable token deployments...");

  // Deploy dUSD token only (dS removed for Fraxtal)
  await deployTestERC20StablecoinUpgradeableTokens(
    hre,
    {
      dUSD: [], // No initial mints
    },
    await hre.ethers.getSigner(testTokenDeployer),
  );

  console.log(`☯️  ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = "deploy_dstable_tokens";
// Add the alias tag "dStable" so that other deployment scripts can declare a dependency on it
func.tags = ["dstable", "dStable", "dstable-tokens", "mock"];

export default func;
