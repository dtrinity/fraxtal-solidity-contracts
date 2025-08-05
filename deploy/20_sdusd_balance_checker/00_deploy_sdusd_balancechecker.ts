import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const SDUSD_BALANCE_CHECKER_ID = "sdUSDBalanceChecker";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  // Fetch sdUSD token address from deployment artifacts
  const sdUSDTokenDeployment = await deployments.get("DStakeToken_sdUSD");
  const SD_USD_TOKEN_ADDRESS = sdUSDTokenDeployment.address;

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
  console.log(
    "  - GasUsed :",
    deployment.receipt?.gasUsed?.toString() || "N/A",
  );
  console.log("-----------------");

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = "deploy_sdusd_balance_checker_standalone";
func.tags = ["sdUSDBalanceChecker", "standalone", "sdusd-balance-checker"];
func.dependencies = ["dStakeCore"]; // Ensure dSTAKE tokens are deployed first

export default func;
