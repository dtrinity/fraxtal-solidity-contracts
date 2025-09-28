import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployUiPoolDataProvider } from "../../../utils/lending/deploy/03_periphery_post/03-ui-helpers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployUiPoolDataProvider(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.tags = ["lbp", "lbp-periphery-post", "lbp-ui-helpers"];
func.id = "UiPoolDataProvider";

export default func;
