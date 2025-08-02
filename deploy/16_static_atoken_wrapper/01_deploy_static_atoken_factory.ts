import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { DLEND_STATIC_A_TOKEN_FACTORY_ID } from "../../typescript/deploy-ids";
import { POOL_PROXY_ID } from "../../utils/lending/deploy-ids";

// Use the deployment ID from the central location
export const STATIC_ATOKEN_FACTORY_ID = DLEND_STATIC_A_TOKEN_FACTORY_ID;
export const INCENTIVES_CONTROLLER_ID = "IncentivesController";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { lendingDeployer } = await getNamedAccounts();

  console.log(`Starting deployment of StaticATokenFactory...`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${lendingDeployer}`);

  // Get config for current network
  const _config = await getConfig(hre);

  // Get the Pool contract
  const poolDeployment = await get(POOL_PROXY_ID);
  console.log(`Pool address: ${poolDeployment.address}`);

  // Deploy StaticATokenFactory
  const staticATokenFactoryDeployment = await deploy(STATIC_ATOKEN_FACTORY_ID, {
    from: lendingDeployer,
    contract: "StaticATokenFactory",
    args: [poolDeployment.address],
    log: true,
  });

  if (staticATokenFactoryDeployment.newlyDeployed) {
    console.log(
      `StaticATokenFactory deployed at ${staticATokenFactoryDeployment.address}`,
    );
  } else {
    console.log(
      `StaticATokenFactory already deployed at ${staticATokenFactoryDeployment.address}`,
    );
  }

  console.log(`🎁 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["StaticATokenFactory", "aTokenWrapper"];
func.dependencies = ["lbp-init-reserves"];
