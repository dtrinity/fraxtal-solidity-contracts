import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { AMO_DEBT_TOKEN_ID, AMO_MANAGER_V2_ID, COLLATERAL_VAULT_CONTRACT_ID } from "../../utils/deploy-ids";
import { HARD_PEG_ORACLE_WRAPPER_ID, ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;
  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await ethers.getSigner(dusdDeployer);
  const {
    dusd: { address: dusdAddress },
  } = await getConfig(hre);

  const { address: oracleAggregatorAddress } = await deployments.get(ORACLE_AGGREGATOR_ID);
  const { address: collateralVaultAddress } = await deployments.get(COLLATERAL_VAULT_CONTRACT_ID);

  // Deploy AmoDebtToken if absent
  const existingDebtToken = await deployments.getOrNull(AMO_DEBT_TOKEN_ID);
  const debtTokenAddress =
    existingDebtToken?.address ??
    (await deployContract(hre, AMO_DEBT_TOKEN_ID, ["dTRINITY AMO Receipt", "amo-dUSD"], undefined, deployer, undefined, "AmoDebtToken"))
      .address;

  // Ensure the oracle aggregator can price the debt token (peg at $1 like dUSD)
  const oracleAggregator = await ethers.getContractAt("OracleAggregator", oracleAggregatorAddress, deployer);

  if ((await oracleAggregator.assetOracles(debtTokenAddress)) === ethers.ZeroAddress) {
    const { address: hardPegOracleWrapperAddress } = await deployments.get(HARD_PEG_ORACLE_WRAPPER_ID);
    await (await oracleAggregator.setOracle(debtTokenAddress, hardPegOracleWrapperAddress)).wait();
    console.log(`  ➕ Pointed oracle for debt token ${debtTokenAddress} to HardPegOracleWrapper at ${hardPegOracleWrapperAddress}`);
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

  // Ensure deployer retains admin for configuration (expected on fresh deploy)
  if (!(await debtToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address))) {
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

  return true;
};

func.id = `dUSD:${AMO_MANAGER_V2_ID}`;
func.tags = ["dusd-upgrade", AMO_MANAGER_V2_ID, AMO_DEBT_TOKEN_ID];
func.dependencies = [COLLATERAL_VAULT_CONTRACT_ID, "dUSD", "oracle-wrapper", ORACLE_AGGREGATOR_ID];

export default func;
