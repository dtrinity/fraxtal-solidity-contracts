import TransparentUpgradeableProxy from "@openzeppelin/contracts/build/contracts/TransparentUpgradeableProxy.json";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import {
  NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR_ID,
  PROXY_ADMIN_ID,
  TRANSPARENT_UPGRADEABLE_PROXY_ID,
} from "../../../utils/dex/deploy-ids";
import { isLocalNetwork, isMainnetNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (isMainnetNetwork(hre.network.name)) {
    console.log("Skipping deployment on mainnet");
    return false;
  }

  const config = await getConfig(hre);

  // Skip deployment if dex config is not populated
  if (!config.dex) {
    console.log(
      "Skipping Transparent Proxy Descriptor deployment - dex config not populated",
    );
    return false;
  }

  if (isLocalNetwork(hre.network.name)) {
    console.log("No need to deploy proxy descriptor on temporary networks");
    return false;
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  const { address: positionDescriptorAddress } = await hre.deployments.get(
    NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR_ID,
  );

  const { address: proxyAdminAddress } =
    await hre.deployments.get(PROXY_ADMIN_ID);

  await deployContract(
    hre,
    TRANSPARENT_UPGRADEABLE_PROXY_ID,
    [positionDescriptorAddress, proxyAdminAddress, "0x"],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    {
      abi: TransparentUpgradeableProxy.abi,
      bytecode: TransparentUpgradeableProxy.bytecode,
    },
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = TRANSPARENT_UPGRADEABLE_PROXY_ID;
func.tags = ["dex", "dex-periphery"];
export default func;
