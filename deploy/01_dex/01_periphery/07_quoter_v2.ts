import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import {
  QUOTER_V2_ID,
  UNISWAP_V3_FACTORY_ID,
} from "../../../utils/dex/deploy-ids";
import { getWETH9Address } from "../../../utils/weth9";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer } = await hre.getNamedAccounts();

  const weth9Address = await getWETH9Address(hre);

  const { address: factoryAddress } = await hre.deployments.get(
    UNISWAP_V3_FACTORY_ID,
  );

  // The QuoterV2 will be automatically found in contracts/dex/periphery/QuoterV2.sol
  await deployContract(
    hre,
    QUOTER_V2_ID,
    [factoryAddress, weth9Address],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "QuoterV2",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = QUOTER_V2_ID;
func.tags = ["dex", "dex-periphery"];
export default func;
