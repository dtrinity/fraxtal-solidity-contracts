import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { TEST_WETH9_ID } from "../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost network");
    return false;
  }

  // Mint some wrapped ETH for all the test accounts
  const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

  const weth9Deployment = await hre.deployments.getOrNull(TEST_WETH9_ID);

  if (!weth9Deployment) {
    console.log("WETH9 deployment not found");
    return false;
  }

  // Get the WETH9 instance
  const weth9Contract = await hre.ethers.getContractAt(
    TEST_WETH9_ID,
    weth9Deployment?.address,
    await hre.ethers.getSigner(dexDeployer),
  );

  console.log("-----------------");
  console.log("Minting WETH for the deployer and liquidity adder");

  // Mint WETH9 for the deployer
  await weth9Contract.deposit({
    value: hre.ethers.parseEther((100).toString()),
  });

  console.log("Minted WETH for the deployer: ", dexDeployer);

  // Transfer half WETH9 to the liquidity adder
  await weth9Contract.transfer(
    dexLiquidityAdder,
    hre.ethers.parseEther((100 / 2).toString()),
  );

  console.log("Minted WETH for the liquidity adder: ", dexLiquidityAdder);
  console.log("-----------------");

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = `${TEST_WETH9_ID}-mint`;
func.tags = ["mock", "weth9"];
export default func;
