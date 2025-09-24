import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { AMO_MANAGER_ID, CURVE_STABLESWAPNG_AMO_VAULT_ID } from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer, dusdCollateralWithdrawer, dusdRecoverer, dusdAmoTrader } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dusdDeployer);
  const { dusd } = await getConfig(hre);
  const curve = dusd?.amoVaults?.curveStableSwapNG;

  if (!curve) {
    console.log("Skipping Curve AMO vault deployment since missing Curve contracts config");
    return true;
  }

  const { address: amoManagerAddress } = await hre.deployments.get(AMO_MANAGER_ID);
  let oracleAggregatorAddress = ZeroAddress;

  try {
    const { address } = await hre.deployments.get(ORACLE_AGGREGATOR_ID);
    oracleAggregatorAddress = address;
  } catch (e: any) {
    if (isLocalNetwork(hre.network.name) && e.message.includes("No deployment found for")) {
      console.log("Ignoring AaveOracle not found since we may be running in a local test fixture");
    } else {
      throw e;
    }
  }

  const deployer = await hre.ethers.getSigner(dusdDeployer);
  const deploymentResult = await deployContract(
    hre,
    CURVE_STABLESWAPNG_AMO_VAULT_ID,
    [
      dusd.address, // _dusd
      amoManagerAddress, // _amoManager
      oracleAggregatorAddress, // _oracle
      curve.router, // _router
      dusdDeployer, // _admin
      dusdCollateralWithdrawer, // _collateralWithdrawer
      dusdRecoverer, // _recoverer
      dusdAmoTrader, // _amoTrader
    ],
    undefined, // auto-filled gas limit
    deployer,
  );
  if (!deploymentResult) throw new Error("Failed to deploy Curve AMO vault");

  console.log("Enabling Curve AMO vault");
  const amoManager = await hre.ethers.getContractAt("AmoManager", amoManagerAddress, signer);
  const { address: vaultAddress } = await hre.deployments.get(CURVE_STABLESWAPNG_AMO_VAULT_ID);
  await amoManager.enableAmoVault(vaultAddress);
  return true;
};

func.id = `dUSD:${CURVE_STABLESWAPNG_AMO_VAULT_ID}`;
func.tags = ["dusd", "amo_vault", "curve_stableswapng"];
func.dependencies = ["dUSD", AMO_MANAGER_ID, ORACLE_AGGREGATOR_ID];

export default func;
