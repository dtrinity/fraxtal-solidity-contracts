import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../utils/constants";
import { MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID } from "../../../utils/curve/deploy-ids";
import { deployContract } from "../../../utils/deploy";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = await getConfig(hre);

  // Skip deployment if dex config is not populated
  if (!config.dex) {
    console.log(
      "Skipping Mock Curve Router deployment - dex config not populated",
    );
    return false;
  }

  // Only local
  if (!isLocalNetwork(hre.network.name)) {
    console.log(
      "Skipping deployment of MockCurveRouterNgPoolsOnlyV1 on non-local network",
    );
    return false;
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  if (!dexDeployer) {
    throw new Error("dexDeployer is not set in the named accounts");
  }

  await deployContract(
    hre,
    MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID,
    [AAVE_ORACLE_USD_DECIMALS], // no constructor arguments
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "MockCurveRouterNgPoolsOnlyV1",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID;
func.tags = ["dex-mock", "mock-curve-router"];

export default func;
