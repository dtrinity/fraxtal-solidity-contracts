import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { deployContract } from "../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID, POOL_CONFIGURATOR_PROXY_ID } from "../../utils/lending/deploy-ids";
import { rateStrategyDUSD } from "../../utils/lending/rate-strategies";
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

  const addressProviderDeployment = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressProvider = await hre.ethers.getContractAt("PoolAddressesProvider", addressProviderDeployment.address, deployer);
  const poolAddress = await addressProvider.getPool();
  const pool = await hre.ethers.getContractAt("Pool", poolAddress, deployer);

  const strategyArgs = [
    addressProviderDeployment.address,
    rateStrategyDUSD.optimalUsageRatio,
    rateStrategyDUSD.baseVariableBorrowRate,
    rateStrategyDUSD.variableRateSlope1,
    rateStrategyDUSD.variableRateSlope2,
    rateStrategyDUSD.stableRateSlope1,
    rateStrategyDUSD.stableRateSlope2,
    rateStrategyDUSD.baseStableRateOffset,
    rateStrategyDUSD.stableRateExcessOffset,
    rateStrategyDUSD.optimalStableToTotalDebtRatio,
  ];

  const { address: newStrategyAddress } = await deployContract(
    hre,
    "ReserveStrategy-rateStrategyDUSD-kink-7p5",
    strategyArgs,
    undefined,
    deployer,
    undefined,
    "DefaultReserveInterestRateStrategy",
  );

  const reserveData = await pool.getReserveData(dusdAddress);
  const currentStrategy = reserveData.interestRateStrategyAddress;

  if (currentStrategy.toLowerCase() === newStrategyAddress.toLowerCase()) {
    console.log("✓ dUSD reserve already points to the new rate strategy.");
    return true;
  }

  const configuratorDeployment = await hre.deployments.get(POOL_CONFIGURATOR_PROXY_ID);
  const configurator = await hre.ethers.getContractAt("PoolConfigurator", configuratorDeployment.address, deployer);

  const aclManager = await hre.ethers.getContractAt("ACLManager", await addressProvider.getACLManager(), deployer);
  const hasRiskAdmin = await aclManager.isRiskAdmin(deployer.address);
  const hasPoolAdmin = await aclManager.isPoolAdmin(deployer.address);

  const setStrategyTx = (): SafeTransactionData => ({
    to: configuratorDeployment.address,
    value: "0",
    data: configurator.interface.encodeFunctionData("setReserveInterestRateStrategyAddress", [dusdAddress, newStrategyAddress]),
  });

  const updateComplete = await executor.tryOrQueue(async () => {
    if (!hasRiskAdmin && !hasPoolAdmin) {
      throw new Error("deployer lacks RISK_ADMIN or POOL_ADMIN role");
    }
    await (await configurator.setReserveInterestRateStrategyAddress(dusdAddress, newStrategyAddress)).wait();
    console.log(`  ➕ Updated dUSD rate strategy to ${newStrategyAddress}`);
  }, setStrategyTx);

  if (!updateComplete) {
    await executor.flush("dUSD rate strategy update: set kink to 7.5%");
    console.log("\n⏳ Rate strategy update queued for governance signatures.");
    console.log("   Re-run the script after the Safe batch is executed to finalize.");
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  return true;
};

func.id = "dUSD:rate-strategy-kink-7p5";
func.tags = ["dusd", "dusd-rate-strategy", "dusd-kink-7p5"];
func.dependencies = [POOL_ADDRESSES_PROVIDER_ID, POOL_CONFIGURATOR_PROXY_ID];

export default func;
