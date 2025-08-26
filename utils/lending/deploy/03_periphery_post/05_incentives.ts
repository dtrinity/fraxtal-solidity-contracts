import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../../../config/config";
import { deployContract } from "../../../deploy";
import {
  EMISSION_MANAGER_ID,
  INCENTIVES_PROXY_ID,
  INCENTIVES_PULL_REWARDS_STRATEGY_ID,
  INCENTIVES_STAKED_TOKEN_STRATEGY_ID,
  INCENTIVES_V2_IMPL_ID,
  POOL_ADDRESSES_PROVIDER_ID,
  STAKE_AAVE_PROXY,
} from "../../deploy-ids";

/**
 * Deploy all the Incentives contract
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/07_incentives.ts
 * An incentives proxy can be deployed per network or per market.
 * You need to take care to upgrade the incentives proxy to the desired implementation,
 * following the IncentivesController interface to be compatible with ATokens or Debt Tokens.
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function deployIncentives(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const config = await getConfig(hre);

  // Check if deployment already exists to ensure idempotency
  const existingEmissionManager = await hre.deployments.getOrNull(EMISSION_MANAGER_ID);
  const existingIncentivesImpl = await hre.deployments.getOrNull(INCENTIVES_V2_IMPL_ID);
  const existingIncentivesProxy = await hre.deployments.getOrNull(INCENTIVES_PROXY_ID);
  const existingPullStrategy = await hre.deployments.getOrNull(INCENTIVES_PULL_REWARDS_STRATEGY_ID);
  const existingStakedStrategy = await hre.deployments.getOrNull(INCENTIVES_STAKED_TOKEN_STRATEGY_ID);

  if (existingEmissionManager && existingIncentivesImpl && existingIncentivesProxy && existingPullStrategy) {
    console.log("✅ Incentives contracts already deployed, skipping...");
    console.log(`  - EmissionManager: ${existingEmissionManager.address}`);
    console.log(`  - IncentivesImpl: ${existingIncentivesImpl.address}`);
    console.log(`  - IncentivesProxy: ${existingIncentivesProxy.address}`);
    console.log(`  - PullStrategy: ${existingPullStrategy.address}`);
    if (existingStakedStrategy) {
      console.log(`  - StakedStrategy: ${existingStakedStrategy.address}`);
    }
    return true;
  }

  const proxyArtifact = await hre.deployments.getExtendedArtifact(
    "InitializableImmutableAdminUpgradeabilityProxy",
  );

  const { address: addressesProvider } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const addressesProviderInstance = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProvider,
    deployer,
  );

  // Deploy EmissionManager (if not exists)
  let emissionManagerDeployResult;
  if (!existingEmissionManager) {
    emissionManagerDeployResult = await deployContract(
      hre,
      EMISSION_MANAGER_ID,
      [deployer.address],
      undefined, // auto-filled gas limit,
      deployer,
      undefined, // no libraries
      "EmissionManager", // The actual contract name
    );
    console.log(`  ✅ EmissionManager deployed: ${emissionManagerDeployResult.address}`);
  } else {
    emissionManagerDeployResult = { address: existingEmissionManager.address };
    console.log(`  ✅ EmissionManager already exists: ${existingEmissionManager.address}`);
  }

  const emissionManager = await hre.ethers.getContractAt(
    "EmissionManager",
    emissionManagerDeployResult.address.toString(),
  );

  // Deploy Incentives Implementation (if not exists)
  let incentivesImplDeployResult;
  if (!existingIncentivesImpl) {
    incentivesImplDeployResult = await deployContract(
      hre,
      INCENTIVES_V2_IMPL_ID,
      [await emissionManager.getAddress()],
      undefined, // auto-filled gas limit,
      deployer,
      undefined, // no libraries,
      "RewardsController", // The actual contract name
    );
    console.log(`  ✅ IncentivesImpl deployed: ${incentivesImplDeployResult.address}`);
  } else {
    incentivesImplDeployResult = { address: existingIncentivesImpl.address };
    console.log(`  ✅ IncentivesImpl already exists: ${existingIncentivesImpl.address}`);
  }

  const incentivesImpl = await hre.ethers.getContractAt(
    "RewardsController",
    incentivesImplDeployResult.address.toString(),
  );

  try {
    await incentivesImpl.initialize(ZeroAddress);
  } catch (error: any) {
    if (
      error?.message.includes("Contract instance has already been initialized")
    ) {
      console.log(`Incentives implementation already initialized`);
    } else {
      throw Error(`Failed to initialize Incentives implementation: ${error}`);
    }
  }

  // The Rewards Controller must be set at PoolAddressesProvider with id keccak256("INCENTIVES_CONTROLLER"):
  // 0x703c2c8634bed68d98c029c18f310e7f7ec0e5d6342c590190b3cb8b3ba54532
  const incentivesControllerId = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes("INCENTIVES_CONTROLLER"),
  );

  const isRewardsProxyPending =
    (await addressesProviderInstance.getAddressFromID(
      incentivesControllerId,
    )) === ZeroAddress;

  if (isRewardsProxyPending) {
    const setRewardsAsProxyTx =
      await addressesProviderInstance.setAddressAsProxy(
        incentivesControllerId,
        await incentivesImpl.getAddress(),
      );

    const proxyAddress = await addressesProviderInstance.getAddressFromID(
      incentivesControllerId,
    );
    await hre.deployments.save(INCENTIVES_PROXY_ID, {
      ...proxyArtifact,
      address: proxyAddress,
    });

    await hre.deployments.log(
      `[Deployment] Attached Rewards implementation and deployed proxy contract: `,
    );
    await hre.deployments.log("- Tx hash:", setRewardsAsProxyTx.hash);
  }

  const { address: rewardsProxyAddress } =
    await hre.deployments.get(INCENTIVES_PROXY_ID);

  // Init RewardsController address (if not already set)
  try {
    const currentRewardsController = await emissionManager.getRewardsController();
    if (currentRewardsController.toLowerCase() !== rewardsProxyAddress.toLowerCase()) {
      await emissionManager.setRewardsController(rewardsProxyAddress);
      console.log(`  ✅ RewardsController address set to: ${rewardsProxyAddress}`);
    } else {
      console.log(`  ✅ RewardsController already set to: ${rewardsProxyAddress}`);
    }
  } catch (error) {
    // If call fails, try to set it anyway
    await emissionManager.setRewardsController(rewardsProxyAddress);
    console.log(`  ✅ RewardsController address set to: ${rewardsProxyAddress}`);
  }

  // Deploy Pull Rewards Strategy (if not exists)
  if (!existingPullStrategy) {
    await deployContract(
      hre,
      INCENTIVES_PULL_REWARDS_STRATEGY_ID,
      [
        rewardsProxyAddress,
        config.lending.incentivesEmissionManager,
        config.lending.incentivesVault,
      ],
      undefined, // auto-filled gas limit,
      deployer,
      undefined, // no libraries
      "PullRewardsTransferStrategy", // The actual contract name
    );
    console.log(`  ✅ PullRewardsStrategy deployed`);
  } else {
    console.log(`  ✅ PullRewardsStrategy already exists: ${existingPullStrategy.address}`);
  }

  const stakedAaveAddress = (await hre.deployments.getOrNull(STAKE_AAVE_PROXY))
    ?.address;

  if (stakedAaveAddress && !existingStakedStrategy) {
    await deployContract(
      hre,
      INCENTIVES_STAKED_TOKEN_STRATEGY_ID,
      [
        rewardsProxyAddress,
        config.lending.incentivesEmissionManager,
        stakedAaveAddress,
      ],
      undefined, // auto-filled gas limit,
      deployer,
      undefined, // no libraries
      "StakedTokenTransferStrategy", // The actual contract name
    );
    console.log(`  ✅ StakedTokenStrategy deployed`);
  } else if (stakedAaveAddress && existingStakedStrategy) {
    console.log(`  ✅ StakedTokenStrategy already exists: ${existingStakedStrategy.address}`);
  } else {
    console.log(
      "[WARNING] Missing StkAave address. Skipping StakedTokenTransferStrategy deployment.",
    );
  }

  // Transfer emission manager ownership (if not already transferred)
  try {
    const currentOwner = await emissionManager.owner();
    if (currentOwner.toLowerCase() !== config.lending.incentivesEmissionManager.toLowerCase()) {
      await emissionManager.transferOwnership(
        config.lending.incentivesEmissionManager,
      );
      console.log(`  ✅ EmissionManager ownership transferred to: ${config.lending.incentivesEmissionManager}`);
    } else {
      console.log(`  ✅ EmissionManager ownership already transferred to: ${config.lending.incentivesEmissionManager}`);
    }
  } catch (error) {
    console.log(`  ⚠️  Could not transfer EmissionManager ownership: ${error instanceof Error ? error.message : String(error)}`);
  }

  return true;
}
