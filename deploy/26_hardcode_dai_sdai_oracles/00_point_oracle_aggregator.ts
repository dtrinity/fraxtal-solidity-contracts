import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { TOKEN_INFO } from "../../config/networks/fraxtal_mainnet";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { HARD_PEG_ORACLE_WRAPPER_ID, ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";
import { isMainnetNetwork } from "../../utils/utils";

const TARGET_ASSETS = [
  { symbol: "DAI", address: TOKEN_INFO.DAI.address },
  { symbol: "sDAI", address: TOKEN_INFO.sDAI.address },
];

function createSetOracleTransaction(
  oracleAggregatorAddress: string,
  assetAddress: string,
  oracleAddress: string,
  contractInterface: any,
): SafeTransactionData {
  return {
    to: oracleAggregatorAddress,
    value: "0",
    data: contractInterface.encodeFunctionData("setOracle", [assetAddress, oracleAddress]),
  };
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log("This deployment is only for mainnet");
    return false;
  }

  const { deployments, ethers } = hre;
  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await ethers.getSigner(dusdDeployer);
  const config = await getConfig(hre);
  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const { address: oracleAggregatorAddress } = await deployments.get(ORACLE_AGGREGATOR_ID);
  const { address: hardPegOracleWrapperAddress } = await deployments.get(HARD_PEG_ORACLE_WRAPPER_ID);

  const oracleAggregator = await ethers.getContractAt("OracleAggregator", oracleAggregatorAddress, deployer);
  const hardPegOracleWrapper = await ethers.getContractAt("HardPegOracleWrapper", hardPegOracleWrapperAddress, deployer);

  const expectedPrice = 10n ** BigInt(config.oracleAggregator.priceDecimals);
  const oracleManagerRole = await oracleAggregator.ORACLE_MANAGER_ROLE();
  const canSetDirect = await oracleAggregator.hasRole(oracleManagerRole, deployer.address);

  let allComplete = true;
  let step = 1;

  console.log(`${step++}. Network: ${hre.network.name}`);
  console.log(`${step++}. OracleAggregator: ${oracleAggregatorAddress}`);
  console.log(`${step++}. HardPegOracleWrapper: ${hardPegOracleWrapperAddress}`);
  console.log(`${step++}. Safe mode enabled: ${executor.useSafe}`);

  const hardPegPrice = await hardPegOracleWrapper.getAssetPrice(ethers.ZeroAddress);
  console.log(`${step++}. HardPegOracleWrapper price check: ${hardPegPrice.toString()}`);

  if (hardPegPrice !== expectedPrice) {
    throw new Error(
      `HardPegOracleWrapper returned ${hardPegPrice.toString()}, expected ${expectedPrice.toString()}`,
    );
  }

  console.log(`${step++}. Deployer ${deployer.address} has ORACLE_MANAGER_ROLE: ${canSetDirect}`);

  for (const asset of TARGET_ASSETS) {
    const currentOracle = await oracleAggregator.assetOracles(asset.address);
    let currentPriceText = "unavailable";

    try {
      currentPriceText = (await oracleAggregator.getAssetPrice(asset.address)).toString();
    } catch (error) {
      currentPriceText = `error: ${(error as Error).message}`;
    }

    console.log(`${step++}. ${asset.symbol} current oracle: ${currentOracle}`);
    console.log(`${step++}. ${asset.symbol} current price: ${currentPriceText}`);

    if (currentOracle === hardPegOracleWrapperAddress) {
      console.log(`${step++}. ${asset.symbol} already points to HardPegOracleWrapper`);
      continue;
    }

    const setOracleTx = (): SafeTransactionData =>
      createSetOracleTransaction(
        oracleAggregatorAddress,
        asset.address,
        hardPegOracleWrapperAddress,
        oracleAggregator.interface,
      );

    console.log(`${step++}. Repoint ${asset.symbol} to HardPegOracleWrapper`);

    const operationComplete = await executor.tryOrQueue(async () => {
      if (!canSetDirect) {
        throw new Error("deployer lacks ORACLE_MANAGER_ROLE");
      }

      await (await oracleAggregator.setOracle(asset.address, hardPegOracleWrapperAddress)).wait();
    }, setOracleTx);

    if (!operationComplete) {
      allComplete = false;
      console.log(`${step++}. ${asset.symbol} update queued for governance execution`);
      continue;
    }

    const updatedOracle = await oracleAggregator.assetOracles(asset.address);
    const updatedPrice = await oracleAggregator.getAssetPrice(asset.address);

    console.log(`${step++}. ${asset.symbol} updated oracle: ${updatedOracle}`);
    console.log(`${step++}. ${asset.symbol} updated price: ${updatedPrice.toString()}`);

    if (updatedOracle !== hardPegOracleWrapperAddress) {
      throw new Error(`${asset.symbol} oracle mismatch after update`);
    }

    if (updatedPrice !== expectedPrice) {
      throw new Error(
        `${asset.symbol} price mismatch after update: ${updatedPrice.toString()} != ${expectedPrice.toString()}`,
      );
    }
  }

  if (!allComplete) {
    await executor.flush("Hardcode DAI and sDAI oracle prices to $1");
    console.log(`${step++}. Governance action queued. Re-run after execution to verify final prices.`);
    console.log(`\n⏳ Some operations require governance signatures to complete.`);
    console.log(`   Re-run the script after the Safe batch is executed to finalize.`);
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  console.log(`${step++}. Completed successfully. DAI and sDAI now return ${expectedPrice.toString()}.`);
  return true;
};

func.id = "HardcodeDAIAndSDAIOraclesMainnet";
func.tags = ["oracle-aggregator", "dai-sdai-hard-peg"];
func.dependencies = [ORACLE_AGGREGATOR_ID, HARD_PEG_ORACLE_WRAPPER_ID];

export default func;
