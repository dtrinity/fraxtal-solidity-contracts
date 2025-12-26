import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { DLoopCoreConfig } from "../../../config/types";
import { dUSD_A_TOKEN_WRAPPER_ID, INCENTIVES_PROXY_ID, POOL_DATA_PROVIDER_ID } from "../../../typescript/deploy-ids";
import { deployContract } from "../../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../../utils/lending/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";
import { DLOOP_CORE_DLEND_ID, DLOOP_CORE_LOGIC_ID } from "../../../utils/vault/deploy-ids";

/**
 * Deploy dLOOP Core DLend contract
 *
 * @param hre - Hardhat runtime environment
 * @param dloopDeployer - The address of the deployer
 * @param dUSDAddress - The dUSD token address
 * @param vaultInfo - The vault information
 * @returns True if the deployment is successful
 */
async function deployDLoopCoreDLend(
  hre: HardhatRuntimeEnvironment,
  dloopDeployer: string,
  dUSDAddress: string,
  vaultInfo: DLoopCoreConfig,
): Promise<boolean> {
  const extraParams = vaultInfo.extraParams;

  if (!extraParams) {
    throw new Error("No extra parameters provided for dLOOP Core DLend");
  }

  const lendingPoolAddressesProviderAddress =
    extraParams.lendingPoolAddressesProvider ?? (await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID)).address;

  const poolDataProviderAddress = extraParams.poolDataProvider ?? (await hre.deployments.get(POOL_DATA_PROVIDER_ID)).address;

  const incentivesProxyAddress = extraParams.rewardsController ?? (await hre.deployments.get(INCENTIVES_PROXY_ID)).address;

  // Get the pool data provider to fetch the aToken address
  const poolDataProviderContract = await hre.ethers.getContractAt("AaveProtocolDataProvider", poolDataProviderAddress);

  // Get the aToken address for the underlying asset
  const reserveTokens = await poolDataProviderContract.getReserveTokensAddresses(vaultInfo.underlyingAsset);
  const aTokenAddress = reserveTokens.aTokenAddress;

  if (aTokenAddress === hre.ethers.ZeroAddress) {
    throw new Error(`Could not find aToken for underlying asset ${vaultInfo.underlyingAsset}`);
  }

  const deploymentName = `${DLOOP_CORE_DLEND_ID}-${vaultInfo.symbol}`;

  let targetStaticATokenWrapperResolved = (extraParams.targetStaticATokenWrapper as string) || "";

  if (!targetStaticATokenWrapperResolved) {
    const wrapperDeployment = await hre.deployments.getOrNull(dUSD_A_TOKEN_WRAPPER_ID);

    if (wrapperDeployment?.address) {
      targetStaticATokenWrapperResolved = wrapperDeployment.address;
    }
  }

  if (!targetStaticATokenWrapperResolved && isLocalNetwork(hre.network.name)) {
    console.log(`Using aToken address as fallback for targetStaticATokenWrapper: ${aTokenAddress}`);
    targetStaticATokenWrapperResolved = aTokenAddress;
  }

  if (!targetStaticATokenWrapperResolved) {
    throw new Error(`targetStaticATokenWrapper is required but could not be resolved. aTokenAddress: ${aTokenAddress}`);
  }

  const treasury = assertNotEmpty(extraParams.treasury);
  const maxTreasuryFeeBps = extraParams.maxTreasuryFeeBps as number | bigint;
  const initialTreasuryFeeBps = (extraParams.initialTreasuryFeeBps as number | bigint) ?? 0;
  const initialExchangeThreshold = (extraParams.initialExchangeThreshold as number | bigint) ?? 0;
  const rewardsController = assertNotEmpty(incentivesProxyAddress);
  const dLendAssetToClaimFor = assertNotEmpty(extraParams.dLendAssetToClaimFor ?? aTokenAddress);
  const targetStaticATokenWrapper = targetStaticATokenWrapperResolved;

  await deployContract(
    hre,
    deploymentName,
    [
      {
        name: assertNotEmpty(vaultInfo.name),
        symbol: assertNotEmpty(vaultInfo.symbol),
        collateralToken: assertNotEmpty(vaultInfo.underlyingAsset),
        debtToken: assertNotEmpty(dUSDAddress),
        lendingPoolAddressesProvider: assertNotEmpty(lendingPoolAddressesProviderAddress),
        targetLeverageBps: vaultInfo.targetLeverageBps,
        lowerBoundTargetLeverageBps: vaultInfo.lowerBoundTargetLeverageBps,
        upperBoundTargetLeverageBps: vaultInfo.upperBoundTargetLeverageBps,
        maxSubsidyBps: vaultInfo.maxSubsidyBps,
        minDeviationBps: vaultInfo.minDeviationBps,
        withdrawalFeeBps: vaultInfo.withdrawalFeeBps,
        rewardsController: rewardsController,
        dLendAssetToClaimFor: dLendAssetToClaimFor,
        targetStaticATokenWrapper: targetStaticATokenWrapper,
        treasury: treasury,
        maxTreasuryFeeBps: maxTreasuryFeeBps,
        initialTreasuryFeeBps: initialTreasuryFeeBps,
        initialExchangeThreshold: initialExchangeThreshold,
      },
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    {
      DLoopCoreLogic: (await hre.deployments.get(DLOOP_CORE_LOGIC_ID)).address,
    },
    "DLoopCoreDLend",
  );

  return true;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, getChainId } = hre;
  const { dloopDeployer } = await getNamedAccounts();
  const chainId = await getChainId();

  // Get network config
  const networkConfig = await getConfig(hre);
  const dloopConfig = networkConfig.dLoop;

  // Skip if no dLOOP configuration or no core vaults are defined
  if (!dloopConfig || !dloopConfig.coreVaults || Object.keys(dloopConfig.coreVaults).length === 0) {
    console.log(`No dLOOP core vaults defined for network ${hre.network.name}. Skipping.`);
    return;
  }

  // Get the dUSD token address from the configuration
  const dUSDAddress = dloopConfig.dUSDAddress;

  if (!dUSDAddress) {
    throw new Error("dUSD token address not found in configuration");
  }

  console.log(`Deploying dLOOP core vaults on network ${hre.network.name} (chainId: ${chainId})`);

  // Deploy each core vault
  for (const [vaultKey, vaultInfo] of Object.entries(dloopConfig.coreVaults)) {
    console.log(`Deploying dLOOP core vault: ${vaultKey}`);

    switch (vaultInfo.venue) {
      case "dlend":
        await deployDLoopCoreDLend(hre, dloopDeployer, dUSDAddress, vaultInfo);
        break;
      default:
        throw new Error(`Unsupported core vault venue: ${vaultInfo.venue}`);
    }
  }

  console.log("All dLOOP core vaults deployed successfully");

  return true;
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

func.tags = ["dloop", "core", "dlend"];
func.dependencies = [DLOOP_CORE_LOGIC_ID, POOL_ADDRESSES_PROVIDER_ID, POOL_DATA_PROVIDER_ID, INCENTIVES_PROXY_ID];
func.id = DLOOP_CORE_DLEND_ID;

export default func;
