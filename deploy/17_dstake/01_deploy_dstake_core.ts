import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { DStakeInstanceConfig } from "../../config/types";
// Assuming these IDs exist

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  const config = await getConfig(hre);

  if (!config.dStake) {
    console.log(
      "No dStake configuration found for this network. This usually means required dependencies (like StaticATokenLM wrappers) are not deployed yet. Skipping core deployment.",
    );
    return;
  }

  // Validate all configs before deploying anything
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;

    if (!instanceConfig.dStable || instanceConfig.dStable === ethers.ZeroAddress) {
      throw new Error(`Missing dStable address for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.symbol) {
      throw new Error(`Missing symbol for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.name) {
      throw new Error(`Missing name for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.initialAdmin || instanceConfig.initialAdmin === ethers.ZeroAddress) {
      throw new Error(`Missing initialAdmin for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.initialFeeManager || instanceConfig.initialFeeManager === ethers.ZeroAddress) {
      throw new Error(`Missing initialFeeManager for dSTAKE instance ${instanceKey}`);
    }

    if (typeof instanceConfig.initialWithdrawalFeeBps !== "number") {
      throw new Error(`Missing initialWithdrawalFeeBps for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.adapters || !Array.isArray(instanceConfig.adapters)) {
      throw new Error(`Missing adapters array for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.defaultDepositVaultAsset || instanceConfig.defaultDepositVaultAsset === ethers.ZeroAddress) {
      throw new Error(`Missing defaultDepositVaultAsset for dSTAKE instance ${instanceKey}`);
    }

    if (!instanceConfig.collateralExchangers || !Array.isArray(instanceConfig.collateralExchangers)) {
      throw new Error(`Missing collateralExchangers array for dSTAKE instance ${instanceKey}`);
    }
  }

  // All configs are valid, proceed with deployment
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;
    const DStakeTokenDeploymentName = `DStakeToken_${instanceKey}`;
    const proxyAdminDeploymentName = `DStakeProxyAdmin_${instanceKey}`;
    const collateralVaultDeploymentName = `DStakeCollateralVault_${instanceKey}`;
    const routerDeploymentName = `DStakeRouter_${instanceKey}`;

    // Check if deployment already exists to ensure idempotency
    const existingDStakeDeployment = await deployments.getOrNull(DStakeTokenDeploymentName);
    const existingCollateralVaultDeployment = await deployments.getOrNull(collateralVaultDeploymentName);
    const existingRouterDeployment = await deployments.getOrNull(routerDeploymentName);

    if (existingDStakeDeployment && existingCollateralVaultDeployment && existingRouterDeployment) {
      console.log(`✅ dStake instance '${instanceKey}' already deployed, skipping...`);
      console.log(`  - DStakeToken: ${existingDStakeDeployment.address}`);
      console.log(`  - CollateralVault: ${existingCollateralVaultDeployment.address}`);
      console.log(`  - Router: ${existingRouterDeployment.address}`);
      continue;
    }

    // If proxy admin exists, verify ownership before attempting proxy operations
    const existingProxyAdmin = await deployments.getOrNull(proxyAdminDeploymentName);

    if (existingProxyAdmin) {
      try {
        const proxyAdmin = await ethers.getContractAt("DStakeProxyAdmin", existingProxyAdmin.address);
        const currentOwner = await proxyAdmin.owner();

        if (currentOwner.toLowerCase() !== deployer.toLowerCase()) {
          console.log(`⚠️  ProxyAdmin ownership transferred to ${currentOwner}, cannot re-deploy proxy`);
          console.log(`   If you need to redeploy, please use --reset flag or transfer ownership back to ${deployer}`);
          continue;
        }
      } catch (error) {
        console.log(`⚠️  Could not verify ProxyAdmin ownership: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`   Skipping deployment to avoid potential failures`);
        continue;
      }
    }

    console.log(`🚀 Deploying dStake instance '${instanceKey}'...`);

    let DStakeTokenDeployment;

    if (!existingDStakeDeployment) {
      DStakeTokenDeployment = await deploy(DStakeTokenDeploymentName, {
        from: deployer,
        contract: "DStakeToken",
        proxy: {
          // Use a dedicated ProxyAdmin so dSTAKE is isolated from the global DefaultProxyAdmin
          viaAdminContract: {
            name: proxyAdminDeploymentName, // Unique deployment per instance
            artifact: "DStakeProxyAdmin", // Re-use the same artifact
          },
          owner: deployer, // keep ownership with deployer for now; migrated later
          proxyContract: "OpenZeppelinTransparentProxy",
          execute: {
            init: {
              methodName: "initialize",
              args: [
                instanceConfig.dStable,
                instanceConfig.name,
                instanceConfig.symbol,
                deployer, // initialAdmin = deployer
                deployer, // initialFeeManager = deployer
              ],
            },
          },
        },
        log: false,
      });
      console.log(`  ✅ DStakeToken deployed: ${DStakeTokenDeployment.address}`);
    } else {
      DStakeTokenDeployment = existingDStakeDeployment;
      console.log(`  ✅ DStakeToken already exists: ${DStakeTokenDeployment.address}`);
    }

    let collateralVaultDeployment;

    if (!existingCollateralVaultDeployment) {
      collateralVaultDeployment = await deploy(collateralVaultDeploymentName, {
        from: deployer,
        contract: "DStakeCollateralVault",
        args: [DStakeTokenDeployment.address, instanceConfig.dStable],
        log: false,
      });
      console.log(`  ✅ CollateralVault deployed: ${collateralVaultDeployment.address}`);
    } else {
      collateralVaultDeployment = existingCollateralVaultDeployment;
      console.log(`  ✅ CollateralVault already exists: ${collateralVaultDeployment.address}`);
    }

    if (!existingRouterDeployment) {
      const routerDeployment = await deploy(routerDeploymentName, {
        from: deployer,
        contract: "DStakeRouterDLend",
        args: [DStakeTokenDeployment.address, collateralVaultDeployment.address],
        log: false,
      });
      console.log(`  ✅ Router deployed: ${routerDeployment.address}`);
    } else {
      console.log(`  ✅ Router already exists: ${existingRouterDeployment.address}`);
    }

    // NOTE: Governance permissions will be granted in the post-deployment
    // role-migration script. No additional role grants are necessary here.
  }

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["dStakeCore", "dStake"];
// Depends on adapters being deployed if adapters need to be configured *during* core deployment (unlikely)
// Primarily depends on the underlying dStable tokens being deployed.
func.dependencies = ["dStable", "StaticATokenWrappers"]; // Ensure dUSD and its wrapped token are deployed

// Mark script as executed so it won't run again, and rely on idempotent logic.
func.id = "deploy_dstake_core";
