import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const SDUSD_BALANCE_CHECKER_ID = "sdUSDBalanceChecker";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  // sdUSD token address on Fraxtal mainnet
  const SD_USD_TOKEN_ADDRESS = "0x58AcC2600835211Dcb5847c5Fa422791Fd492409";

  console.log(`Deploying ${SDUSD_BALANCE_CHECKER_ID} with admin: ${deployer}`);
  console.log(`Using sdUSD token address: ${SD_USD_TOKEN_ADDRESS}`);

  const deployment = await deploy(SDUSD_BALANCE_CHECKER_ID, {
    from: deployer,
    contract: "sdUSDBalanceChecker",
    args: [deployer, SD_USD_TOKEN_ADDRESS], // initialAdmin and sdUSDToken parameters
    log: false, // We handle our own logging
  });

  console.log("-----------------");
  console.log(`'${SDUSD_BALANCE_CHECKER_ID}' contract deployed`);
  console.log("  - Address :", deployment.address);
  console.log("  - From    :", deployer);
  console.log("  - TxHash  :", deployment.transactionHash);
  console.log("  - GasUsed :", deployment.receipt?.gasUsed?.toString() || "N/A");
  console.log("-----------------");

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = "deploy_sdusd_balance_checker";
func.tags = ["sdUSDBalanceChecker", "vaults", "dstake"];
func.dependencies = []; // No dependencies needed

export default func;