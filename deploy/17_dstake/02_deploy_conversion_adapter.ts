import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { DStakeInstanceConfig } from "../../config/types";
import { dUSD_A_TOKEN_WRAPPER_ID } from "../../typescript/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  const config = await getConfig(hre);

  if (!config.dStake) {
    console.log(
      "No dStake configuration found for this network. Skipping conversion adapter deployment.",
    );
    return;
  }

  // Deploy WrappedDLendConversionAdapter for each dSTAKE instance
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;

    // Validate required config
    if (
      !instanceConfig.dStable ||
      instanceConfig.dStable === ethers.ZeroAddress
    ) {
      throw new Error(
        `Missing dStable address for dSTAKE instance ${instanceKey}`,
      );
    }

    // Get the collateral vault deployment
    const collateralVaultDeploymentName = `DStakeCollateralVault_${instanceKey}`;
    const collateralVault = await deployments.getOrNull(
      collateralVaultDeploymentName,
    );

    if (!collateralVault) {
      console.log(
        `Warning: ${collateralVaultDeploymentName} not found. Skipping adapter deployment for ${instanceKey}.`,
      );
      continue;
    }

    // Get the wrapped aToken deployment based on the instance (dS removed for Fraxtal)
    const wrappedTokenDeploymentId =
      instanceKey === "sdUSD" ? dUSD_A_TOKEN_WRAPPER_ID : null;

    if (!wrappedTokenDeploymentId) {
      console.log(
        `Warning: Unknown instance key ${instanceKey}. Expected sdUSD only (dS removed for Fraxtal). Skipping adapter deployment.`,
      );
      continue;
    }

    // Check if the wrapped token is deployed
    const wrappedTokenDeployment = await deployments.getOrNull(
      wrappedTokenDeploymentId,
    );

    if (!wrappedTokenDeployment) {
      console.log(
        `Warning: Wrapped token ${wrappedTokenDeploymentId} not found for instance ${instanceKey}. Skipping adapter deployment.`,
      );
      continue;
    }

    // Deploy the adapter
    const deploymentName = `WrappedDLendConversionAdapter_${instanceKey}`;
    console.log(`Deploying ${deploymentName}...`);

    const adapterDeployment = await deploy(deploymentName, {
      from: deployer,
      contract: "WrappedDLendConversionAdapter",
      args: [
        instanceConfig.dStable, // dStable address (e.g., dUSD)
        wrappedTokenDeployment.address, // wrappedDLendToken address (e.g., wddUSD StaticATokenLM)
        collateralVault.address, // collateralVault address
      ],
      log: true,
    });

    console.log(
      `WrappedDLendConversionAdapter for ${instanceKey} deployed at ${adapterDeployment.address}`,
    );
  }

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["dStakeAdapters", "dStake", "WrappedDLendConversionAdapter"];
// This depends on dSTAKE core being deployed and the wrapped aTokens being available
func.dependencies = ["dStakeCore", "dUSD-aTokenWrapper"]; // dS removed for Fraxtal

// Ensure one-shot execution based on func.id and file checksum.
func.id = "deploy_dstake_adapters";
