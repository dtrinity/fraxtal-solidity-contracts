import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { LENDING_CORE_VERSION, MARKET_NAME } from "../../../utils/lending/constants";
import { deployTokensImplementations } from "../../../utils/lending/deploy/02_market/08_tokens_implementations";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployTokensImplementations(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.id = `TokenImplementations:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-tokens"];

export default func;
