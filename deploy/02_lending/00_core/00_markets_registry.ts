import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployPoolAddressesProviderRegistry } from "../../../utils/lending/deploy/00_core/00_markets_registry";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer, lendingAddressesProviderRegistryOwner } =
    await hre.getNamedAccounts();

  return deployPoolAddressesProviderRegistry(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    await hre.ethers.getSigner(lendingAddressesProviderRegistryOwner),
  );
};

func.id = "PoolAddressesProviderRegistry";
func.tags = ["lbp", "core", "registry"];

export default func;
