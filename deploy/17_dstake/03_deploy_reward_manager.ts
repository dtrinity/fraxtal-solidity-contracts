import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { DStakeInstanceConfig } from "../../config/types";
import { DStakeRewardManagerDLend, IEmissionManager } from "../../typechain-types";
import { dUSD_A_TOKEN_WRAPPER_ID, EMISSION_MANAGER_ID, INCENTIVES_PROXY_ID, POOL_DATA_PROVIDER_ID } from "../../typescript/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  // Collect instructions for any manual actions required when the deployer lacks permissions.
  const manualActions: string[] = [];

  const config = await getConfig(hre);

  if (!config.dStake) {
    console.log("No dSTAKE configuration found for this network. Skipping dLend rewards manager deployment.");
    return;
  }

  // Check if IncentivesProxy is deployed
  const incentivesProxyDeployment = await deployments.getOrNull(INCENTIVES_PROXY_ID);

  if (!incentivesProxyDeployment) {
    console.log("IncentivesProxy not deployed. Skipping dLend rewards manager deployment.");
    return;
  }

  // Check if EmissionManager is deployed
  const emissionManagerDeployment = await deployments.getOrNull(EMISSION_MANAGER_ID);

  if (!emissionManagerDeployment) {
    console.log("EmissionManager not deployed. Skipping dLend rewards manager deployment.");
    return;
  }

  // Get pool data provider to fetch aToken addresses
  const poolDataProviderDeployment = await deployments.getOrNull(POOL_DATA_PROVIDER_ID);

  if (!poolDataProviderDeployment) {
    console.log("PoolDataProvider not deployed. Skipping dLend rewards manager deployment.");
    return;
  }

  const poolDataProviderContract = await ethers.getContractAt("AaveProtocolDataProvider", poolDataProviderDeployment.address);

  // Deploy reward managers for each dSTAKE instance
  for (const instanceKey in config.dStake) {
    const instanceConfig = config.dStake[instanceKey] as DStakeInstanceConfig;

    console.log(`\nProcessing dSTAKE instance: ${instanceKey}`);

    // Check if the wrapped aToken is deployed
    const wrappedATokenDeploymentId = instanceKey === "sdUSD" ? dUSD_A_TOKEN_WRAPPER_ID : `${instanceKey}_ATokenWrapper`;
    const wrappedATokenDeployment = await deployments.getOrNull(wrappedATokenDeploymentId);

    if (!wrappedATokenDeployment) {
      console.log(`Wrapped aToken not deployed for ${instanceKey}. Skipping reward manager deployment.`);
      continue;
    }

    // Get the collateral vault and router deployments
    const collateralVaultDeployment = await get(`DStakeCollateralVault_${instanceKey}`);
    const routerDeployment = await get(`DStakeRouter_${instanceKey}`);

    // Get the aToken address for the underlying dStable
    const underlyingStablecoinAddress = instanceConfig.dStable;
    const reserveTokens = await poolDataProviderContract.getReserveTokensAddresses(underlyingStablecoinAddress);
    const aTokenAddress = reserveTokens.aTokenAddress;

    if (aTokenAddress === ethers.ZeroAddress) {
      console.log(`No aToken found for underlying stable ${underlyingStablecoinAddress}. Skipping reward manager for ${instanceKey}.`);
      continue;
    }

    // Deploy reward manager configuration
    const treasury = config.walletAddresses.governanceMultisig;
    const maxTreasuryFeeBps = 500; // 5%
    const initialTreasuryFeeBps = 100; // 1%
    const initialExchangeThreshold = ethers.parseUnits("1", 18); // 1 dStable

    const deployArgs = [
      collateralVaultDeployment.address, // dStakeCollateralVault
      routerDeployment.address, // dStakeRouter
      incentivesProxyDeployment.address, // dLendRewardsController
      wrappedATokenDeployment.address, // targetStaticATokenWrapper
      aTokenAddress, // dLendAssetToClaimFor (the actual aToken)
      treasury,
      maxTreasuryFeeBps,
      initialTreasuryFeeBps,
      initialExchangeThreshold,
    ];

    const rewardManagerDeploymentName = `DStakeRewardManagerDLend_${instanceKey}`;
    const deployment = await deploy(rewardManagerDeploymentName, {
      from: deployer,
      contract: "DStakeRewardManagerDLend",
      args: deployArgs,
      log: true,
      skipIfAlreadyDeployed: true,
    });

    if (deployment.newlyDeployed) {
      console.log(`Deployed DStakeRewardManagerDLend for ${instanceKey} at ${deployment.address}`);

      // Authorize this manager as a claimer via EmissionManager
      const deployerSigner = await ethers.getSigner(deployer);
      const emissionManager = await ethers.getContractAt("EmissionManager", emissionManagerDeployment.address);

      // Attempt to authorize this manager as a claimer via EmissionManager only if the deployer is the owner.
      const emissionOwner = await emissionManager.owner();

      if (emissionOwner.toLowerCase() === deployer.toLowerCase()) {
        console.log(`Setting claimer for ${instanceKey} wrapper...`);
        const tx = await (emissionManager as unknown as IEmissionManager)
          .connect(deployerSigner)
          .setClaimer(wrappedATokenDeployment.address, deployment.address);
        await tx.wait();
        console.log(`Claimer set for ${instanceKey}`);
      } else {
        manualActions.push(
          `EmissionManager (${emissionManagerDeployment.address}).setClaimer(${wrappedATokenDeployment.address}, ${deployment.address})`,
        );
      }

      // Configure roles
      const rewardManager = (await ethers.getContractAt(
        "DStakeRewardManagerDLend",
        deployment.address,
      )) as unknown as DStakeRewardManagerDLend;

      const DEFAULT_ADMIN_ROLE = await rewardManager.DEFAULT_ADMIN_ROLE();
      const REWARDS_MANAGER_ROLE = await rewardManager.REWARDS_MANAGER_ROLE();

      const targetAdmin = treasury; // Use governance multisig as admin
      const targetRewardsManager = treasury; // Use governance multisig as rewards manager

      // Grant roles to governance multisig if deployer has admin role
      const deployerIsAdmin = await rewardManager.hasRole(DEFAULT_ADMIN_ROLE, deployer);

      if (!deployerIsAdmin) {
        manualActions.push(
          `RewardManager (${deployment.address}) role setup: grantRole(DEFAULT_ADMIN_ROLE, ${targetAdmin}); grantRole(REWARDS_MANAGER_ROLE, ${targetRewardsManager}); optionally revoke roles from ${deployer}`,
        );
      } else {
        // Grant roles to governance multisig
        if (targetAdmin !== deployer) {
          if (!(await rewardManager.hasRole(DEFAULT_ADMIN_ROLE, targetAdmin))) {
            await rewardManager.grantRole(DEFAULT_ADMIN_ROLE, targetAdmin);
            console.log(`Granted DEFAULT_ADMIN_ROLE to ${targetAdmin}`);
          }
        }

        if (targetRewardsManager !== deployer) {
          if (!(await rewardManager.hasRole(REWARDS_MANAGER_ROLE, targetRewardsManager))) {
            await rewardManager.grantRole(REWARDS_MANAGER_ROLE, targetRewardsManager);
            console.log(`Granted REWARDS_MANAGER_ROLE to ${targetRewardsManager}`);
          }
        }

        // Optionally revoke roles from deployer if different from governance
        // IMPORTANT: revoke non-admin roles first, then admin role last
        if (targetRewardsManager !== deployer && (await rewardManager.hasRole(REWARDS_MANAGER_ROLE, deployer))) {
          await rewardManager.revokeRole(REWARDS_MANAGER_ROLE, deployer);
          console.log(`Revoked REWARDS_MANAGER_ROLE from ${deployer}`);
        }

        if (targetAdmin !== deployer && (await rewardManager.hasRole(DEFAULT_ADMIN_ROLE, deployer))) {
          await rewardManager.revokeRole(DEFAULT_ADMIN_ROLE, deployer);
          console.log(`Revoked DEFAULT_ADMIN_ROLE from ${deployer}`);
        }
      }

      console.log(`Set up DStakeRewardManagerDLend for ${instanceKey}.`);
    } else {
      console.log(`DStakeRewardManagerDLend for ${instanceKey} already deployed at ${deployment.address}`);
    }
  }

  // Print any manual actions required
  if (manualActions.length > 0) {
    console.log("\n⚠️  Manual actions required to finalize dLend rewards deployment:");
    manualActions.forEach((a: string) => console.log(`   - ${a}`));
  }

  console.log(`\n🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
// Define tags and dependencies
func.tags = ["DStakeRewardManagerDLend", "dStakeRewards"];
func.dependencies = [
  "dStakeCore",
  "dStakeAdapters",
  "lbp-IncentivesProxy",
  dUSD_A_TOKEN_WRAPPER_ID,
  POOL_DATA_PROVIDER_ID,
  EMISSION_MANAGER_ID,
];

// Mark as executed once based on func.id and file checksum.
func.id = "dstake_dlend_rewards";
func.runAtTheEnd = true;
