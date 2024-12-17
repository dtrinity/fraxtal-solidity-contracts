import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployAndInitializePool } from "../../../utils/dex/pool";

// We need an initial stablecoin pool to bootstrap the UI
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

  const config = await getConfig(hre);
  const initialPools = config.dex.initialPools;

  if (initialPools.length == 0) {
    console.log("No initial pools to deploy");
    // If there are no initial pools to deploy, we consider the migration a success
    return true;
  }

  for (const pool of initialPools) {
    await deployAndInitializePool(
      hre,
      pool.token0Address,
      pool.token1Address,
      pool.fee,
      pool.initPrice,
      pool.inputToken0Amount,
      await hre.ethers.getSigner(dexDeployer),
      await hre.ethers.getSigner(dexLiquidityAdder),
      pool.gasLimits,
      pool.deadlineInSeconds,
    );
  }

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = "DEXInitializePools";
func.tags = ["dex", "dex-init"];
export default func;
