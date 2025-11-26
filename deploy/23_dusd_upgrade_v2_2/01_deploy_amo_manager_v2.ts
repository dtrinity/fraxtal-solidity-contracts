import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { deployContract } from "../../utils/deploy";
import { AMO_DEBT_TOKEN_ID, AMO_MANAGER_V2_ID, COLLATERAL_VAULT_CONTRACT_ID } from "../../utils/deploy-ids";
import { HARD_PEG_ORACLE_WRAPPER_ID, ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;
  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await ethers.getSigner(dusdDeployer);
  const config = await getConfig(hre);
  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const {
    dusd: { address: dusdAddress },
  } = config;

  const { address: oracleAggregatorAddress } = await deployments.get(ORACLE_AGGREGATOR_ID);
  const { address: collateralVaultAddress } = await deployments.get(COLLATERAL_VAULT_CONTRACT_ID);

  let allComplete = true;

  // Deploy AmoDebtToken if absent
  const existingDebtToken = await deployments.getOrNull(AMO_DEBT_TOKEN_ID);
  const debtTokenNewlyDeployed = !existingDebtToken;
  const debtTokenAddress =
    existingDebtToken?.address ??
    (await deployContract(hre, AMO_DEBT_TOKEN_ID, ["dTRINITY AMO Receipt", "amo-dUSD"], undefined, deployer, undefined, "AmoDebtToken"))
      .address;

  // Ensure the oracle aggregator can price the debt token (peg at $1 like dUSD)
  const oracleAggregator = await ethers.getContractAt("OracleAggregator", oracleAggregatorAddress, deployer);

  if ((await oracleAggregator.assetOracles(debtTokenAddress)) === ethers.ZeroAddress) {
    const { address: hardPegOracleWrapperAddress } = await deployments.get(HARD_PEG_ORACLE_WRAPPER_ID);
    const oracleManagerRole = await oracleAggregator.ORACLE_MANAGER_ROLE();
    const canSetDirect = await oracleAggregator.hasRole(oracleManagerRole, deployer.address);

    const setOracleTx = (): SafeTransactionData => ({
      to: oracleAggregatorAddress,
      value: "0",
      data: oracleAggregator.interface.encodeFunctionData("setOracle", [debtTokenAddress, hardPegOracleWrapperAddress]),
    });

    const oracleComplete = await executor.tryOrQueue(async () => {
      if (!canSetDirect) {
        throw new Error("deployer lacks ORACLE_MANAGER_ROLE");
      }
      await (await oracleAggregator.setOracle(debtTokenAddress, hardPegOracleWrapperAddress)).wait();
      console.log(`  ➕ Pointed oracle for debt token ${debtTokenAddress} to HardPegOracleWrapper at ${hardPegOracleWrapperAddress}`);
    }, setOracleTx);

    if (!oracleComplete) allComplete = false;
  }

  // Deploy AmoManagerV2 if absent
  const existingManager = await deployments.getOrNull(AMO_MANAGER_V2_ID);
  const managerAddress =
    existingManager?.address ??
    (
      await deployContract(
        hre,
        AMO_MANAGER_V2_ID,
        [oracleAggregatorAddress, debtTokenAddress, dusdAddress, collateralVaultAddress],
        undefined,
        deployer,
        undefined,
        "AmoManagerV2",
      )
    ).address;

  // Wire roles/allowlists for debt token
  const debtToken = await ethers.getContractAt("AmoDebtToken", debtTokenAddress, deployer);

  const DEFAULT_ADMIN_ROLE = await debtToken.DEFAULT_ADMIN_ROLE();
  const AMO_MANAGER_ROLE = await debtToken.AMO_MANAGER_ROLE();

  // Ensure deployer retains admin for configuration (only on fresh deploy to avoid re-introducing deployer admin later)
  if (debtTokenNewlyDeployed && !(await debtToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address))) {
    await (await debtToken.grantRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();
  }

  if (!(await debtToken.hasRole(AMO_MANAGER_ROLE, managerAddress))) {
    await (await debtToken.grantRole(AMO_MANAGER_ROLE, managerAddress)).wait();
    console.log(`  ➕ Granted AMO_MANAGER_ROLE to AmoManagerV2 at ${managerAddress}`);
  } else {
    console.log(`  ✓ AmoManagerV2 already has AMO_MANAGER_ROLE`);
  }

  // Allowlist the vault and manager for debt token transfers
  const allowlistTargets = [collateralVaultAddress, managerAddress];

  for (const target of allowlistTargets) {
    if (!(await debtToken.isAllowlisted(target))) {
      await (await debtToken.setAllowlisted(target, true)).wait();
      console.log(`  ➕ Allowlisted ${target} on AmoDebtToken`);
    }
  }

  if (!allComplete) {
    await executor.flush("AmoManagerV2 deployment: governance operations");
    console.log("\n⏳ Some operations require governance signatures to complete.");
    console.log("   Re-run the script after the Safe batch is executed to finalize.");
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  return true;
};

func.id = `dUSD:${AMO_MANAGER_V2_ID}`;
func.tags = ["dusd-upgrade", AMO_MANAGER_V2_ID, AMO_DEBT_TOKEN_ID];
func.dependencies = [COLLATERAL_VAULT_CONTRACT_ID, "dUSD", "oracle-wrapper", ORACLE_AGGREGATOR_ID];

export default func;
