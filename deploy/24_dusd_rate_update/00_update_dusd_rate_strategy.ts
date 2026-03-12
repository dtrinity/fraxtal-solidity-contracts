import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { deployContract } from "../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID, POOL_CONFIGURATOR_PROXY_ID } from "../../utils/lending/deploy-ids";
import { getReserveConfigurationData } from "../../utils/lending/reserve";
import { getReserveTokenAddresses } from "../../utils/lending/token";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);
  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const reserveTokenAddresses = await getReserveTokenAddresses(hre);
  const dusdAddress = reserveTokenAddresses.dUSD;

  if (!dusdAddress) {
    console.warn("[WARNING] dUSD reserve address not found; skipping rate strategy update.");
    return false;
  }

  const reserveConfig = config.lending.reservesConfig.dUSD ?? config.lending.reservesConfig.DUSD;

  if (!reserveConfig?.strategy) {
    console.warn("[WARNING] dUSD reserve config not found; skipping rate strategy update.");
    return true;
  }

  const desiredStrategy = reserveConfig.strategy;
  const addressProviderDeployment = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressProvider = await hre.ethers.getContractAt("PoolAddressesProvider", addressProviderDeployment.address, deployer);
  const poolAddress = await addressProvider.getPool();
  const pool = await hre.ethers.getContractAt("Pool", poolAddress, deployer);

  const strategyArgs = [
    addressProviderDeployment.address,
    desiredStrategy.optimalUsageRatio,
    desiredStrategy.baseVariableBorrowRate,
    desiredStrategy.variableRateSlope1,
    desiredStrategy.variableRateSlope2,
    desiredStrategy.stableRateSlope1,
    desiredStrategy.stableRateSlope2,
    desiredStrategy.baseStableRateOffset,
    desiredStrategy.stableRateExcessOffset,
    desiredStrategy.optimalStableToTotalDebtRatio,
  ];

  const { address: newStrategyAddress } = await deployContract(
    hre,
    `ReserveStrategy-${desiredStrategy.name}`,
    strategyArgs,
    undefined,
    deployer,
    undefined,
    "DefaultReserveInterestRateStrategy",
  );

  const reserveData = await pool.getReserveData(dusdAddress);
  const currentStrategy = reserveData.interestRateStrategyAddress;
  const { reserveFactor: currentReserveFactor } = await getReserveConfigurationData(dusdAddress);
  const targetReserveFactor = BigInt(reserveConfig.reserveFactor);
  const needsRateStrategyUpdate = currentStrategy.toLowerCase() !== newStrategyAddress.toLowerCase();
  const needsReserveFactorUpdate = currentReserveFactor !== targetReserveFactor;

  if (!needsRateStrategyUpdate && !needsReserveFactorUpdate) {
    console.log("✓ dUSD reserve already matches the target rate strategy and reserve factor.");
    return true;
  }

  const configuratorDeployment = await hre.deployments.get(POOL_CONFIGURATOR_PROXY_ID);
  const configurator = await hre.ethers.getContractAt("PoolConfigurator", configuratorDeployment.address, deployer);

  const aclManager = await hre.ethers.getContractAt("ACLManager", await addressProvider.getACLManager(), deployer);
  const hasRiskAdmin = await aclManager.isRiskAdmin(deployer.address);
  const hasPoolAdmin = await aclManager.isPoolAdmin(deployer.address);

  const setReserveFactorTx = (): SafeTransactionData => ({
    to: configuratorDeployment.address,
    value: "0",
    data: configurator.interface.encodeFunctionData("setReserveFactor", [dusdAddress, targetReserveFactor]),
  });

  const setStrategyTx = (): SafeTransactionData => ({
    to: configuratorDeployment.address,
    value: "0",
    data: configurator.interface.encodeFunctionData("setReserveInterestRateStrategyAddress", [dusdAddress, newStrategyAddress]),
  });

  const canExecuteDirectly = hasRiskAdmin || hasPoolAdmin;

  const ensureAdminAccess = (): void => {
    if (!canExecuteDirectly) {
      throw new Error("deployer lacks RISK_ADMIN or POOL_ADMIN role");
    }
  };

  let updateComplete = true;

  if (needsReserveFactorUpdate) {
    const reserveFactorComplete = await executor.tryOrQueue(async () => {
      ensureAdminAccess();
      await (await configurator.setReserveFactor(dusdAddress, targetReserveFactor)).wait();
      console.log(`  ➕ Updated dUSD reserve factor to ${targetReserveFactor.toString()}`);
    }, setReserveFactorTx);

    updateComplete = updateComplete && reserveFactorComplete;
  }

  if (needsRateStrategyUpdate) {
    const strategyComplete = await executor.tryOrQueue(async () => {
      ensureAdminAccess();
      await (await configurator.setReserveInterestRateStrategyAddress(dusdAddress, newStrategyAddress)).wait();
      console.log(`  ➕ Updated dUSD rate strategy to ${newStrategyAddress}`);
    }, setStrategyTx);

    updateComplete = updateComplete && strategyComplete;
  }

  if (!updateComplete) {
    await executor.flush("dUSD rate strategy + reserve factor update: 3% base / 7.5% kink / 30% max / 0% fee");
    console.log("\n⏳ dUSD reserve updates queued for governance signatures.");
    console.log("   Re-run the script after the Safe batch is executed to finalize.");
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  return true;
};

func.id = "dUSD:rate-strategy-3-7p5-30-fee-0";
func.tags = ["dusd", "dusd-rate-strategy", "dusd-rate-strategy-3-7p5-30-fee-0"];
func.dependencies = [POOL_ADDRESSES_PROVIDER_ID, POOL_CONFIGURATOR_PROXY_ID];

export default func;
