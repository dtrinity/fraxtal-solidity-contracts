import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { deployContract } from "../../utils/deploy";
import {
  EMISSION_MANAGER_ID,
  INCENTIVES_PROXY_ID,
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_CONFIGURATOR_PROXY_ID,
  POOL_DATA_PROVIDER_ID,
} from "../../utils/lending/deploy-ids";
import { getReserveTokenAddresses } from "../../utils/lending/token";

const FRAXTAL_TIMELOCK = "0x0bafada2a5824864720873ee40cd960b36445212";

const TIMELOCK_ABI = [
  "function getMinDelay() view returns (uint256)",
  "function PROPOSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function hashOperation(address,uint256,bytes,bytes32,bytes32) view returns (bytes32)",
  "function isOperationPending(bytes32) view returns (bool)",
  "function isOperationReady(bytes32) view returns (bool)",
  "function schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
  "function execute(address,uint256,bytes,bytes32,bytes32)",
];

const INCENTIVES_ABI = [
  "function getRewardsByAsset(address) view returns (address[])",
  "function getRewardsData(address,address) view returns (uint256,uint256,uint256,uint256)",
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "fraxtal_mainnet") {
    return true;
  }

  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);
  const reserveConfig = config.lending?.reservesConfig?.dUSD ?? config.lending?.reservesConfig?.DUSD;

  if (!reserveConfig?.strategy || !config.safeConfig) {
    throw new Error("Fraxtal dUSD reserve or Safe configuration is missing");
  }

  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const reserveTokenAddresses = await getReserveTokenAddresses(hre);
  const dusdAddress = reserveTokenAddresses.dUSD;

  if (!dusdAddress) {
    throw new Error("dUSD reserve address not found");
  }

  const desiredStrategy = reserveConfig.strategy;
  const addressProviderDeployment = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
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
  const { address: deployedStrategyAddress } = await deployContract(
    hre,
    `ReserveStrategy-${desiredStrategy.name}`,
    strategyArgs,
    undefined,
    deployer,
    undefined,
    "DefaultReserveInterestRateStrategy",
  );
  const newStrategyAddress = deployedStrategyAddress.toString();

  const [configuratorDeployment, dataProviderDeployment, incentivesDeployment, emissionManagerDeployment] = await Promise.all([
    hre.deployments.get(POOL_CONFIGURATOR_PROXY_ID),
    hre.deployments.get(POOL_DATA_PROVIDER_ID),
    hre.deployments.get(INCENTIVES_PROXY_ID),
    hre.deployments.get(EMISSION_MANAGER_ID),
  ]);
  const configurator = await hre.ethers.getContractAt("PoolConfigurator", configuratorDeployment.address, deployer);
  const dataProvider = await hre.ethers.getContractAt("AaveProtocolDataProvider", dataProviderDeployment.address, deployer);
  const currentStrategy = await dataProvider.getInterestRateStrategyAddress(dusdAddress);

  if (currentStrategy.toLowerCase() !== newStrategyAddress.toLowerCase()) {
    const strategyUpdateData = configurator.interface.encodeFunctionData("setReserveInterestRateStrategyAddress", [
      dusdAddress,
      newStrategyAddress,
    ]);
    const timelock = await hre.ethers.getContractAt(TIMELOCK_ABI, FRAXTAL_TIMELOCK, deployer);
    const proposerRole = await timelock.PROPOSER_ROLE();

    if (!(await timelock.hasRole(proposerRole, config.safeConfig.safeAddress))) {
      throw new Error("Fraxtal governance Safe lacks the timelock PROPOSER_ROLE");
    }

    const minDelay = await timelock.getMinDelay();
    const salt = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`dtrinity-fraxtal-dusd-rate-60:${newStrategyAddress.toLowerCase()}`));
    const operationId = await timelock.hashOperation(configuratorDeployment.address, 0, strategyUpdateData, hre.ethers.ZeroHash, salt);

    let timelockTx: SafeTransactionData | undefined;

    if (await timelock.isOperationReady(operationId)) {
      timelockTx = {
        to: FRAXTAL_TIMELOCK,
        value: "0",
        data: timelock.interface.encodeFunctionData("execute", [
          configuratorDeployment.address,
          0,
          strategyUpdateData,
          hre.ethers.ZeroHash,
          salt,
        ]),
      };
      console.log(`  ➕ dUSD rate strategy operation ${operationId} is ready for execution`);
    } else if (await timelock.isOperationPending(operationId)) {
      console.log(`  ⏳ dUSD rate strategy operation ${operationId} is already pending`);
    } else {
      timelockTx = {
        to: FRAXTAL_TIMELOCK,
        value: "0",
        data: timelock.interface.encodeFunctionData("schedule", [
          configuratorDeployment.address,
          0,
          strategyUpdateData,
          hre.ethers.ZeroHash,
          salt,
          minDelay,
        ]),
      };
      console.log(`  ➕ dUSD rate strategy operation ${operationId} will be scheduled with ${minDelay}s delay`);
    }

    if (timelockTx) {
      executor.queue(timelockTx);
    }
  }

  const { variableDebtTokenAddress } = await dataProvider.getReserveTokensAddresses(dusdAddress);
  const incentives = await hre.ethers.getContractAt(INCENTIVES_ABI, incentivesDeployment.address, deployer);
  const rewards = await incentives.getRewardsByAsset(variableDebtTokenAddress);

  if (rewards.some((reward: string) => reward.toLowerCase() === dusdAddress.toLowerCase())) {
    const [, emissionPerSecond] = await incentives.getRewardsData(variableDebtTokenAddress, dusdAddress);

    if (emissionPerSecond !== 0n) {
      const emissionManager = await hre.ethers.getContractAt("EmissionManager", emissionManagerDeployment.address, deployer);
      executor.queue({
        to: emissionManagerDeployment.address,
        value: "0",
        data: emissionManager.interface.encodeFunctionData("setEmissionPerSecond", [variableDebtTokenAddress, [dusdAddress], [0]]),
      });
      console.log(`  ➕ Queued dUSD borrower rebate reduction from ${emissionPerSecond.toString()} raw units/sec to 0`);
    }
  } else {
    console.log("✓ No dUSD borrower rebate is configured");
  }

  if (executor.queuedTransactions.length === 0) {
    console.log("✓ dUSD rate strategy and borrower rebate already match the target configuration.");
    return true;
  }

  const bundlePrepared = await executor.flush("dUSD: retain 80% / 7.5% kink, set 60% max variable rate, and disable borrower rebate");

  if (!bundlePrepared) {
    return false;
  }

  console.log("\n⏳ Safe Transaction Builder bundle prepared. Import and execute it; rerun after the timelock delay to prepare execution.");
  return false;
};

func.id = "dUSD:rate-strategy-3-7p5-60-disable-borrow-rebate";
func.tags = ["dusd", "dusd-rate-strategy", "dusd-borrow-rebate", "dusd-rate-strategy-3-7p5-60-disable-borrow-rebate"];
func.dependencies = [
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_CONFIGURATOR_PROXY_ID,
  POOL_DATA_PROVIDER_ID,
  INCENTIVES_PROXY_ID,
  EMISSION_MANAGER_ID,
];

export default func;
