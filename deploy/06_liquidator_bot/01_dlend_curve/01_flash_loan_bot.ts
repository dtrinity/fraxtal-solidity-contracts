import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { CURVE_HELPER_ID } from "../../../utils/curve/deploy-ids";
import { deployContract } from "../../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../../utils/lending/deploy-ids";
import { FLASH_LOAN_LIQUIDATOR_CURVE_ID } from "../../../utils/liquidator-bot/curve/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

/**
 * Deploy a flash loan liquidator bot for Curve
 *
 * @param hre - Hardhat runtime environment
 * @param liquidatorBotDeployer - The address of the deployer
 * @param flashLoanLender - The address of the flash loan lender
 * @param slippageTolerance - The slippage tolerance
 * @param swapRouter - The address of the swap router
 * @param maxSlippageSurplusSwapBps - The max slippage surplus swap bps
 * @param defaultSwapParamsList - The default swap params list
 * @param proxyContractMap - The proxy contract map from the token to the proxy contract
 * @returns True if the deployment is successful
 */
async function deployFlashLoanLiquidatorBot(
  hre: HardhatRuntimeEnvironment,
  liquidatorBotDeployer: string,
  flashLoanLender: string,
  slippageTolerance: number,
  swapRouter: string,
  maxSlippageSurplusSwapBps: number,
  defaultSwapParamsList: any[],
  proxyContractMap: { [key: string]: string },
): Promise<boolean> {
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  const poolAddress = await addressProviderContract.getPool();

  // Get the deployed CurveHelper library address
  const { address: curveHelperAddress } =
    await hre.deployments.get(CURVE_HELPER_ID);

  await deployContract(
    hre,
    FLASH_LOAN_LIQUIDATOR_CURVE_ID,
    [
      assertNotEmpty(flashLoanLender),
      assertNotEmpty(lendingPoolAddressesProviderAddress),
      assertNotEmpty(poolAddress),
      slippageTolerance,
      assertNotEmpty(swapRouter),
      maxSlippageSurplusSwapBps,
      defaultSwapParamsList,
    ],
    undefined,
    await hre.ethers.getSigner(liquidatorBotDeployer),
    {
      CurveHelper: curveHelperAddress,
    },
    "FlashLoanLiquidatorAaveBorrowRepayCurve",
  );

  // Set the proxy contract
  const flashLoanLiquidatorBotDeployedResult = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_CURVE_ID,
  );
  const flashLoanLiquidatorBotContract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorAaveBorrowRepayCurve",
    flashLoanLiquidatorBotDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  for (const [token, proxyContract] of Object.entries(proxyContractMap)) {
    await flashLoanLiquidatorBotContract.setProxyContract(token, proxyContract);
  }

  return true;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  // Check if liquidator bot config is undefined first, regardless of network
  if (!config.liquidatorBotCurve) {
    console.log("Curve liquidator bot config not found, skipping deployment");
    return false;
  }

  if (isLocalNetwork(hre.network.name)) {
    throw new Error(
      "Curve liquidator bot config cannot be used on local networks",
    );
  }

  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  const poolAddress = await addressProviderContract.getPool();

  return deployFlashLoanLiquidatorBot(
    hre,
    liquidatorBotDeployer,
    poolAddress,
    config.liquidatorBotCurve.slippageTolerance,
    config.liquidatorBotCurve.swapRouter,
    config.liquidatorBotCurve.maxSlippageSurplusSwapBps,
    config.liquidatorBotCurve.defaultSwapParamsList,
    config.liquidatorBotCurve.proxyContractMap,
  );
};

/**
 * Assert that the value is not empty
 *
 * @param value - The value to assert
 * @returns The input value if it is not empty
 */
function assertNotEmpty(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }

  if (value.trim() === "") {
    throw new Error("Trimmed value is empty");
  }

  if (value.length === 0) {
    throw new Error("Value is empty");
  }
  return value;
}

func.tags = ["liquidator-bot"];
func.dependencies = ["curve-helper"];
func.id = FLASH_LOAN_LIQUIDATOR_CURVE_ID;

export default func;
