import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { CurveSwapExtraParams } from "../../config/types";
import { ONE_BPS_UNIT } from "../../utils/constants";
import { MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID } from "../../utils/curve/deploy-ids";
import { deployContract } from "../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { getTokenAmountFromAddress } from "../../utils/token";
import { isLocalNetwork } from "../../utils/utils";
import { DLOOP_VAULT_CURVE_ID_PREFIX } from "../../utils/vault/deploy-ids";
import {
  convertTargetLeverageBpsToX,
  getDLoopVaultCurveDeploymentName,
} from "../../utils/vault/dloop.utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  if (isLocalNetwork(hre.network.name)) {
    if (config.dLoopCurve) {
      throw new Error("Curve dLoop config cannot be used on local networks");
    }

    console.log("Deploying dLoop vaults for Curve on local network");

    return deployDLoopVaultsCurveLocal(hre, dloopDeployer);
  }

  if (!config.dLoopCurve) {
    // Skip the deployment if the configuration is not available
    console.log(
      "The dLoopCurve configuration is not available, skipping the deployment",
    );
    return false;
  }

  console.log(
    `Deploying dLoop vaults on ${hre.network.name} for Curve with ${config.dLoopCurve.vaults.length} vaults`,
  );

  return deployDLoopVaultsCurve(
    hre,
    dloopDeployer,
    config.dLoopCurve.dUSDAddress,
    config.dLoopCurve.vaults,
  );
};

func.tags = ["dloop", "vault"];
func.dependencies = [];
func.id = DLOOP_VAULT_CURVE_ID_PREFIX;

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

/**
 * Assert that the swap route is valid
 *
 * @param swapRoute - The swap route to assert
 * @param inputToken - The input token
 * @param outputToken - The output token
 */
function assertSwapRouteIsValid(
  swapRoute: string[],
  inputToken: string,
  outputToken: string,
): void {
  if (swapRoute.length < 2) {
    throw new Error(
      `The swap route length is less than 2: ${swapRoute.length}`,
    );
  }

  if (swapRoute[0] !== inputToken) {
    throw new Error(
      `The swap route does not start with the input token: ${swapRoute[0]} !== ${inputToken}`,
    );
  }

  // Get the last non-zero element
  const endToken = swapRoute.reduceRight((acc, token) => {
    if (acc === ethers.ZeroAddress && token !== ethers.ZeroAddress) {
      return token;
    }
    return acc;
  });

  if (endToken !== outputToken) {
    throw new Error(
      `The swap route does not end with the output token: ${endToken} !== ${outputToken}`,
    );
  }
}

/**
 * Assert that the array length is equal to the expected length
 *
 * @param array - The array to assert
 * @param length - The expected length
 * @param prefix - The prefix for the error message
 */
function assertArrayLength<T>(
  array: T[],
  length: number,
  prefix: string,
): void {
  if (array.length !== length) {
    throw new Error(
      `${prefix} array length is not equal to ${length}: ${array.length}`,
    );
  }
}

/**
 * Assert that the swap extra params are valid
 *
 * @param swapExtraParams - The swap extra params to assert
 * @param prefix - The prefix for the error message
 */
function assertValidSwapExtraParams(
  swapExtraParams: CurveSwapExtraParams,
  prefix: string,
): void {
  assertArrayLength(swapExtraParams.route, 11, "route");
  assertArrayLength(swapExtraParams.swapParams, 5, "swapParams");

  if (swapExtraParams.swapSlippageBufferBps <= 0) {
    throw new Error(`${prefix}.swapSlippageBufferBps must be greater than 0`);
  }

  // Length of each element in swapParams should be 5
  for (const swapParams of swapExtraParams.swapParams) {
    assertArrayLength(swapParams, 4, `${prefix}.swapParams`);
  }
}

/**
 * Deploy dLoop vaults for Curve
 *
 * @param hre - Hardhat runtime environment
 * @param dloopDeployer - The address of the deployer
 * @param dUSDAddress - The dUSD token address
 * @param vaults - Array of vault configurations
 * @returns True if the deployment is successful
 */
async function deployDLoopVaultsCurve(
  hre: HardhatRuntimeEnvironment,
  dloopDeployer: string,
  dUSDAddress: string,
  vaults: {
    underlyingAssetAddress: string;
    swapRouter: string;
    defaultDusdToUnderlyingSwapExtraParams: CurveSwapExtraParams;
    defaultUnderlyingToDusdSwapExtraParams: CurveSwapExtraParams;
    targetLeverageBps: number;
    swapSlippageTolerance: number;
    maxSubsidyBps: number;
    maxSlippageSurplusSwapBps: number;
    minimumUnderlyingAssetAmount: number;
    minimumSharesAmount: number;
  }[],
): Promise<boolean> {
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  for (const vaultConfig of vaults) {
    // Sanity check swap extra params
    assertValidSwapExtraParams(
      vaultConfig.defaultDusdToUnderlyingSwapExtraParams,
      "defaultDusdToUnderlyingSwapExtraParams",
    );
    assertValidSwapExtraParams(
      vaultConfig.defaultUnderlyingToDusdSwapExtraParams,
      "defaultUnderlyingToDusdSwapExtraParams",
    );

    // Make sure the swap path valid
    assertSwapRouteIsValid(
      vaultConfig.defaultDusdToUnderlyingSwapExtraParams.route,
      dUSDAddress,
      vaultConfig.underlyingAssetAddress,
    );
    assertSwapRouteIsValid(
      vaultConfig.defaultUnderlyingToDusdSwapExtraParams.route,
      vaultConfig.underlyingAssetAddress,
      dUSDAddress,
    );

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

    const vaultDeploymentName = getDLoopVaultCurveDeploymentName(
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
        assertNotEmpty(dUSDAddress),
        assertNotEmpty(dUSDAddress), // the dUSD contract is the flash minter itself
        assertNotEmpty(vaultConfig.swapRouter),
        vaultConfig.defaultDusdToUnderlyingSwapExtraParams,
        vaultConfig.defaultUnderlyingToDusdSwapExtraParams,
        assertNotEmpty(lendingPoolAddressesProviderAddress),
        vaultConfig.targetLeverageBps,
        vaultConfig.swapSlippageTolerance,
        vaultConfig.maxSubsidyBps,
        vaultConfig.maxSlippageSurplusSwapBps,
        minimumUnderlyingAssetAmount,
        minimumSharesAmount,
      ],
      undefined, // auto-filled gas limit
      await hre.ethers.getSigner(dloopDeployer),
      undefined, // no library
      "DLoopVaultCurve",
    );
  }

  return true;
}

/**
 * Deploy dLoop vaults for Curve on local network
 *
 * @param hre - Hardhat runtime environment
 * @param dloopDeployer - The address of the deployer
 * @returns True if the deployment is successful
 */
async function deployDLoopVaultsCurveLocal(
  hre: HardhatRuntimeEnvironment,
  dloopDeployer: string,
): Promise<boolean> {
  const { address: dUSDAddress } = await hre.deployments.get("DUSD");
  const { address: SFRAXAddress } = await hre.deployments.get("SFRAX");
  const { address: mockCurveSwapRouterAddress } = await hre.deployments.get(
    MOCK_CURVE_ROUTER_NG_POOLS_ONLY_V1_ID,
  );

  // Mock route for local testing
  const mockDusdToUnderlyingRoute = Array(11).fill(ethers.ZeroAddress);
  mockDusdToUnderlyingRoute[0] = dUSDAddress;
  mockDusdToUnderlyingRoute[1] = SFRAXAddress;

  const mockUnderlyingToDusdRoute = Array(11).fill(ethers.ZeroAddress);
  mockUnderlyingToDusdRoute[0] = SFRAXAddress;
  mockUnderlyingToDusdRoute[1] = dUSDAddress;

  // Mock swap params for local testing
  const mockSwapParams = Array(5).fill([0, 0, 0, 0]);

  const mockDusdToUnderlyingSwapExtraParams: CurveSwapExtraParams = {
    route: mockDusdToUnderlyingRoute,
    swapParams: mockSwapParams,
    swapSlippageBufferBps: 100 * ONE_BPS_UNIT, // 1%
  };

  const mockUnderlyingToDusdSwapExtraParams: CurveSwapExtraParams = {
    route: mockUnderlyingToDusdRoute,
    swapParams: mockSwapParams,
    swapSlippageBufferBps: 100 * ONE_BPS_UNIT, // 1%
  };

  return deployDLoopVaultsCurve(hre, dloopDeployer, dUSDAddress, [
    {
      underlyingAssetAddress: SFRAXAddress,
      swapRouter: mockCurveSwapRouterAddress,
      defaultDusdToUnderlyingSwapExtraParams:
        mockDusdToUnderlyingSwapExtraParams,
      defaultUnderlyingToDusdSwapExtraParams:
        mockUnderlyingToDusdSwapExtraParams,
      targetLeverageBps: 300 * 100 * ONE_BPS_UNIT, // 3x leverage
      swapSlippageTolerance: 50 * 100 * ONE_BPS_UNIT, // 50% slippage tolerance
      maxSubsidyBps: 20 * 100 * ONE_BPS_UNIT, // 20% max subsidy
      maxSlippageSurplusSwapBps: 20 * 100 * ONE_BPS_UNIT, // 20% max slippage surplus
      minimumUnderlyingAssetAmount: 0.0001,
      minimumSharesAmount: 0.0001,
    },
  ]);
}
