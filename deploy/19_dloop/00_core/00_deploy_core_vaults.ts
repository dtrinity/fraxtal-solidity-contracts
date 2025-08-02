import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../../utils/lending/deploy-ids";
import { DLOOP_CORE_DLEND_ID } from "../../../utils/vault/deploy-ids";

interface CoreVaultInfo {
  venue: string;
  name: string;
  symbol: string;
  underlyingAsset: string;
  dStable: string;
  targetLeverageBps: number;
  lowerBoundTargetLeverageBps: number;
  upperBoundTargetLeverageBps: number;
  maxSubsidyBps: number;
  extraParams: Record<string, unknown>;
}

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
  vaultInfo: CoreVaultInfo,
): Promise<boolean> {
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  // Get the underlying token symbol to use as the vault name
  const underlyingTokenContract = await hre.ethers.getContractAt(
    "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
    vaultInfo.underlyingAsset,
    await hre.ethers.getSigner(dloopDeployer),
  );
  const underlyingTokenSymbol = await underlyingTokenContract.symbol();

  if (underlyingTokenSymbol === "") {
    throw new Error("The underlying token symbol is empty");
  }

  const deploymentName = `${DLOOP_CORE_DLEND_ID}-${underlyingTokenSymbol}-${vaultInfo.targetLeverageBps}`;

  await deployContract(
    hre,
    deploymentName,
    [
      vaultInfo.name,
      vaultInfo.symbol,
      assertNotEmpty(vaultInfo.underlyingAsset),
      assertNotEmpty(dUSDAddress),
      assertNotEmpty(lendingPoolAddressesProviderAddress),
      vaultInfo.targetLeverageBps,
      vaultInfo.lowerBoundTargetLeverageBps,
      vaultInfo.upperBoundTargetLeverageBps,
      vaultInfo.maxSubsidyBps,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    undefined, // no library
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
  if (
    !dloopConfig ||
    !dloopConfig.coreVaults ||
    Object.keys(dloopConfig.coreVaults).length === 0
  ) {
    console.log(
      `No dLOOP core vaults defined for network ${hre.network.name}. Skipping.`,
    );
    return;
  }

  // Get the dUSD token address from the configuration
  const dUSDAddress = dloopConfig.dUSDAddress;

  if (!dUSDAddress) {
    throw new Error("dUSD token address not found in configuration");
  }

  console.log(
    `Deploying dLOOP core vaults on network ${hre.network.name} (chainId: ${chainId})`,
  );

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
func.dependencies = [POOL_ADDRESSES_PROVIDER_ID];
func.id = DLOOP_CORE_DLEND_ID;

export default func;
