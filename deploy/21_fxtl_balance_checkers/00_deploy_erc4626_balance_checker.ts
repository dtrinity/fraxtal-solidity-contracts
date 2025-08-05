import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const ERC4626_BALANCE_CHECKER_ID = "ERC4626BalanceChecker_sdUSD";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  console.log(
    `Deploying ${ERC4626_BALANCE_CHECKER_ID} with admin: ${deployer}`,
  );

  // Fetch sdUSD token address from deployment artifacts
  const sdUSDTokenDeployment = await deployments.get("DStakeToken_sdUSD");
  const SD_USD_TOKEN_ADDRESS = sdUSDTokenDeployment.address;

  console.log(`Using sdUSD token address: ${SD_USD_TOKEN_ADDRESS}`);

  const deployment = await deploy(ERC4626_BALANCE_CHECKER_ID, {
    from: deployer,
    contract:
      "contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker.sol:ERC4626BalanceChecker",
    args: [deployer, SD_USD_TOKEN_ADDRESS], // initialAdmin and vaultToken parameters
    log: false, // We handle our own logging
  });

  console.log("-----------------");
  console.log(`'${ERC4626_BALANCE_CHECKER_ID}' contract deployed`);
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

func.id = "deploy_erc4626_balance_checker_sdusd";
func.tags = ["ERC4626BalanceChecker", "sdUSD", "fxtl-balance-checkers"];
func.dependencies = ["dStakeCore"]; // Ensure dSTAKE tokens are deployed first

export default func;
