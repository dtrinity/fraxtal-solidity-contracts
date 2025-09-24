import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import deployUniswapV3AmoVault from "../../scripts/dusd/amo_vault/uniswapV3_amo_vault";
import { AMO_MANAGER_ID, UNIV3_AMO_VAULT_ID } from "../../utils/deploy-ids";
import { ORACLE_ID } from "../../utils/lending/deploy-ids";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer, dusdCollateralWithdrawer, dusdRecoverer, dusdAmoTrader } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dusdDeployer);
  const { dusd } = await getConfig(hre);
  const uniswapV3 = dusd?.amoVaults?.uniswapV3;

  if (!uniswapV3) {
    // Skip deployment if UniswapV3 is not configured; not all AMO vaults need to be deployed every time
    console.log("Skipping UniswapV3 AMO vault deployment since missing Uniswap V3 contracts config");
    return true;
  }

  const { address: amoManagerAddress } = await hre.deployments.get(AMO_MANAGER_ID);
  // This deployment is used in local test fixtures where dex oracle may not be deployed yet
  // So we ignore "Error: No deployment found for" in local
  let aaveOracleAddress = ZeroAddress;

  try {
    const { address } = await hre.deployments.get(ORACLE_ID);
    aaveOracleAddress = address;
  } catch (e: any) {
    if (isLocalNetwork(hre.network.name) && e.message.includes("No deployment found for")) {
      console.log("Ignoring AaveOracle not found since we may be running in a local test fixture");
    } else {
      throw e;
    }
  }
  const deploymentResult = await deployUniswapV3AmoVault(
    hre,
    dusd.address,
    amoManagerAddress,
    aaveOracleAddress,
    uniswapV3.pool,
    uniswapV3.nftPositionManager,
    uniswapV3.router,
    dusdDeployer,
    dusdCollateralWithdrawer,
    dusdRecoverer,
    dusdAmoTrader,
  );
  if (!deploymentResult) throw new Error("Failed to deploy UniswapV3 AMO vault");

  console.log("Enabling UniswapV3 AMO vault");
  const amoManager = await hre.ethers.getContractAt("AmoManager", amoManagerAddress, signer);
  const { address: vaultAddress } = await hre.deployments.get(UNIV3_AMO_VAULT_ID);
  await amoManager.enableAmoVault(vaultAddress);
  return true;
};

func.id = `dUSD:${UNIV3_AMO_VAULT_ID}`;
func.tags = ["dusd", "amo_vault", "uniswap_v3"];
func.dependencies = ["dUSD", AMO_MANAGER_ID, ORACLE_ID, "UniswapV3Pool", "NonfungiblePositionManager", "SwapRouter"];

export default func;
