import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const ERC4626_BALANCE_CHECKER_ID = "ERC4626BalanceChecker";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  console.log(
    `Deploying ${ERC4626_BALANCE_CHECKER_ID} with admin: ${deployer}`,
  );

  // For this generic deployment, we'll use a placeholder vault token address
  // In production, this should be replaced with the actual ERC4626 vault address
  const PLACEHOLDER_VAULT_ADDRESS =
    "0x0000000000000000000000000000000000000001";

  console.log(`Using placeholder vault address: ${PLACEHOLDER_VAULT_ADDRESS}`);
  console.log(
    "⚠️  IMPORTANT: Update the vault address for production deployment!",
  );

  const deployment = await deploy(ERC4626_BALANCE_CHECKER_ID, {
    from: deployer,
    contract:
      "contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker.sol:ERC4626BalanceChecker",
    args: [deployer, PLACEHOLDER_VAULT_ADDRESS], // initialAdmin and vaultToken parameters
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

func.id = "deploy_erc4626_balance_checker_generic";
func.tags = ["ERC4626BalanceChecker", "generic", "fxtl-balance-checkers"];

export default func;
