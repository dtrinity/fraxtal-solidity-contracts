import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployTestERC20StablecoinUpgradeableTokens } from "../../utils/token.stablecoin";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost and hardhat network");
    return false;
  }

  const { testTokenDeployer, dexDeployer, testTokenOwner1 } =
    await hre.getNamedAccounts();
  await deployTestERC20StablecoinUpgradeableTokens(
    hre,
    {
      // Deploy only dUSD for consistency with production deployments
      dUSD: [
        {
          amount: 1e8,
          toAddress: dexDeployer,
        },
        {
          amount: 1e8 / 2,
          toAddress: testTokenOwner1,
        },
      ],
    },
    await hre.ethers.getSigner(testTokenDeployer),
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = "DeployMint-TestDUSD";
func.tags = ["mock", "test-token-mint"];
export default func;
