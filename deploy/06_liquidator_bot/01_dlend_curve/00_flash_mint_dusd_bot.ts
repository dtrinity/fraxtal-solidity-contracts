import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { CURVE_HELPER_ID } from "../../../utils/curve/deploy-ids";
import { deployContract } from "../../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../../utils/lending/deploy-ids";
import { getReserveTokensAddressesFromAddress } from "../../../utils/lending/token";
import { FLASH_MINT_LIQUIDATOR_CURVE_ID } from "../../../utils/liquidator-bot/curve/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

/**
 * Deploy a flash mint liquidator bot for Curve
 *
 * @param hre - Hardhat runtime environment
 * @param liquidatorBotDeployer - The address of the deployer
 * @param flashMinter - The address of the flash minter
 * @param slippageTolerance - The slippage tolerance
 * @param swapRouter - The address of the swap router
 * @param maxSlippageSurplusSwapBps - The max slippage surplus swap bps
 * @param defaultSwapParamsList - The default swap params list
 * @param proxyContractMap - The proxy contract map from the token to the proxy contract
 * @returns True if the deployment is successful
 */
async function deployFlashMintLiquidatorBot(
  hre: HardhatRuntimeEnvironment,
  liquidatorBotDeployer: string,
  flashMinter: string,
  slippageTolerance: number,
  swapRouter: string,
  maxSlippageSurplusSwapBps: number,
  defaultSwapParamsList: any[],
  proxyContractMap: { [key: string]: string },
): Promise<boolean> {
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  // Get the AToken of the quote token
  const { aTokenAddress } =
    await getReserveTokensAddressesFromAddress(flashMinter);

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

  // The order of parameters in the constructor matches what we're passing:
  await deployContract(
    hre,
    FLASH_MINT_LIQUIDATOR_CURVE_ID,
    [
      assertNotEmpty(flashMinter),
      assertNotEmpty(lendingPoolAddressesProviderAddress),
      assertNotEmpty(poolAddress),
      assertNotEmpty(aTokenAddress),
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
    "FlashMintLiquidatorAaveBorrowRepayCurve",
  );

  // Set the proxy contract
  const flashMintLiquidatorBotDeployedResult = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_CURVE_ID,
  );
  const flashMintLiquidatorBotContract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayCurve",
    flashMintLiquidatorBotDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  for (const [token, proxyContract] of Object.entries(proxyContractMap)) {
    await flashMintLiquidatorBotContract.setProxyContract(token, proxyContract);
  }

  return true;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  if (!config.liquidatorBotCurve) {
    console.log("Curve liquidator bot config not found, skipping deployment");
    return false;
  }

  if (isLocalNetwork(hre.network.name)) {
    throw new Error(
      "Curve liquidator bot config cannot be used on local networks",
    );
  }

  return deployFlashMintLiquidatorBot(
    hre,
    liquidatorBotDeployer,
    config.liquidatorBotCurve.flashMinter,
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
func.id = FLASH_MINT_LIQUIDATOR_CURVE_ID;

export default func;
