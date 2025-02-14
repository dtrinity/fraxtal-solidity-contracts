import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { ONE_BPS_UNIT } from "../../utils/constants";
import { deployContract } from "../../utils/deploy";
import { SWAP_ROUTER_ID } from "../../utils/dex/deploy-ids";
import { checkIfSwapPathExists } from "../../utils/dex/pool";
import { convertToSwapPath } from "../../utils/dex/utils";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { getTokenAmountFromAddress } from "../../utils/token";
import { isLocalNetwork } from "../../utils/utils";
import { DLOOP_VAULT_UNISWAP_V3_ID_PREFIX } from "../../utils/vault/deploy-ids";
import {
  convertTargetLeverageBpsToX,
  getDLoopVaultUniswapV3DeploymentName,
} from "../../utils/vault/dloop.utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  if (!config.dLoopUniswapV3) {
    // Skip the deployment if the configuration is not available
    console.log(
      "The dLoopUniswapV3 configuration is not available, skipping the deployment",
    );
    return false;
  }

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  for (const vaultConfig of config.dLoopUniswapV3.vaults) {
    // For local networks, we don't need to check if the swap path exists as it will be initialized in the test setup
    if (!isLocalNetwork(hre.network.name)) {
      // Make sure the swap path exists
      await checkIfSwapPathExists(
        vaultConfig.defaultDusdToUnderlyingSwapPath.tokenAddressesPath,
        vaultConfig.defaultDusdToUnderlyingSwapPath.poolFeeSchemaPath,
      );
      await checkIfSwapPathExists(
        vaultConfig.defaultUnderlyingToDusdSwapPath.tokenAddressesPath,
        vaultConfig.defaultUnderlyingToDusdSwapPath.poolFeeSchemaPath,
      );
    }

    // Get the swap path
    const dusdToUnderlyingAddressesPath =
      vaultConfig.defaultDusdToUnderlyingSwapPath.tokenAddressesPath;
    const defaultDusdToUnderlyingSwapPath = convertToSwapPath(
      dusdToUnderlyingAddressesPath,
      vaultConfig.defaultDusdToUnderlyingSwapPath.poolFeeSchemaPath,
      false, // The vault is using exactOutput
    );

    // After the config can be converted to the swap path, we check if the input and output addresses are consistent
    if (
      dusdToUnderlyingAddressesPath[0] !== vaultConfig.dusdAddress ||
      dusdToUnderlyingAddressesPath[
        dusdToUnderlyingAddressesPath.length - 1
      ] !== vaultConfig.underlyingAssetAddress
    ) {
      throw new Error(
        `The vaultConfig.defaultDusdToUnderlyingSwapPath is not consistent with the input and output addresses: ${dusdToUnderlyingAddressesPath} !== ${vaultConfig.dusdAddress} -> ${vaultConfig.underlyingAssetAddress}`,
      );
    }

    // Get the swap path
    const underlyingToDusdAddressesPath =
      vaultConfig.defaultUnderlyingToDusdSwapPath.tokenAddressesPath;
    const defaultUnderlyingToDusdSwapPath = convertToSwapPath(
      underlyingToDusdAddressesPath,
      vaultConfig.defaultUnderlyingToDusdSwapPath.poolFeeSchemaPath,
      false, // The vault is using exactOutput
    );

    // After the config can be converted to the swap path, we check if the input and output addresses are consistent
    if (
      underlyingToDusdAddressesPath[0] !== vaultConfig.underlyingAssetAddress ||
      underlyingToDusdAddressesPath[
        underlyingToDusdAddressesPath.length - 1
      ] !== vaultConfig.dusdAddress
    ) {
      throw new Error(
        `The vaultConfig.defaultUnderlyingToDusdSwapPath is not consistent with the input and output addresses: ${underlyingToDusdAddressesPath} !== ${vaultConfig.underlyingAssetAddress} -> ${vaultConfig.dusdAddress}`,
      );
    }

    // Get the underlying token symbol to use as the vault name
    const underlyingTokenContract = await hre.ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
      vaultConfig.underlyingAssetAddress,
      await hre.ethers.getSigner(dloopDeployer),
    );
    const underlyingTokenSymbol = await underlyingTokenContract.symbol();

    if (underlyingTokenSymbol === "") {
      throw new Error("The underlying token symbol is empty");
    }

    const vaultDeploymentName = getDLoopVaultUniswapV3DeploymentName(
      underlyingTokenSymbol,
      vaultConfig.targetLeverageBps,
    );

    const leverageLevel = convertTargetLeverageBpsToX(
      vaultConfig.targetLeverageBps / ONE_BPS_UNIT,
    );
    const tokenName = `dLOOP ${leverageLevel} ${underlyingTokenSymbol}`; // e.g., dLOOP 3X sFRAX
    const tokenSymbol = `${leverageLevel}${underlyingTokenSymbol}`; // e.g., 3XsFRAX

    const minimumUnderlyingAssetAmount = await getTokenAmountFromAddress(
      vaultConfig.underlyingAssetAddress,
      vaultConfig.minimumUnderlyingAssetAmount,
    );
    const minimumSharesAmount = ethers.parseUnits(
      vaultConfig.minimumSharesAmount.toString(),
      18, // vault shares are 18 decimals
    );

    await deployContract(
      hre,
      vaultDeploymentName,
      [
        tokenName,
        tokenSymbol,
        assertNotEmpty(vaultConfig.underlyingAssetAddress),
        assertNotEmpty(vaultConfig.dusdAddress),
        assertNotEmpty(vaultConfig.dusdAddress), // the dUSD contract is the flash minter itself
        assertNotEmpty(routerAddress),
        defaultDusdToUnderlyingSwapPath,
        defaultUnderlyingToDusdSwapPath,
        assertNotEmpty(lendingPoolAddressesProviderAddress),
        vaultConfig.targetLeverageBps,
        vaultConfig.swapSlippageTolerance,
        vaultConfig.maxSubsidyBps,
        minimumUnderlyingAssetAmount,
        minimumSharesAmount,
      ],
      undefined, // auto-filled gas limit
      await hre.ethers.getSigner(dloopDeployer),
      undefined, // no library
      "DLoopVaultUniswapV3",
    );
  }

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.tags = ["dloop", "vault"];
func.dependencies = [];
func.id = DLOOP_VAULT_UNISWAP_V3_ID_PREFIX;

export default func;

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
