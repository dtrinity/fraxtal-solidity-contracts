import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { STATIC_ATOKEN_FACTORY_ID } from "./01_deploy_static_atoken_factory";
import { DUSD_STATIC_ATOKEN_ID } from "./02_deploy_static_atoken_wrappers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { get } = deployments;
  const { lendingDeployer } = await getNamedAccounts();
  const signer = await hre.ethers.getSigner(lendingDeployer);

  console.log(`Starting configuration of StaticATokenLM wrappers...`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${lendingDeployer}`);

  // Get config for current network
  const config = await getConfig(hre);

  // Get governance multisig address
  const governanceMultisig = config.walletAddresses.governanceMultisig;
  console.log(`Governance multisig: ${governanceMultisig}`);

  // Configuration for each wrapper (dS removed for Fraxtal)
  const wrappersToConfig = [
    {
      deploymentId: DUSD_STATIC_ATOKEN_ID,
      symbol: "dUSD",
    },
  ];

  for (const wrapperConfig of wrappersToConfig) {
    console.log(`\nConfiguring ${wrapperConfig.symbol} wrapper...`);

    try {
      // Check if wrapper deployment exists
      const wrapperDeployment = await deployments.getOrNull(
        wrapperConfig.deploymentId,
      );

      if (!wrapperDeployment) {
        console.log(
          `${wrapperConfig.symbol} wrapper not deployed, skipping...`,
        );
        continue;
      }

      const wrapper = await hre.ethers.getContractAt(
        "StaticATokenLM",
        wrapperDeployment.address,
        signer,
      );
      console.log(
        `${wrapperConfig.symbol} wrapper address: ${wrapperDeployment.address}`,
      );

      // Check if rewards controller is set
      const rewardsController = await wrapper.REWARDS_CONTROLLER();

      if (rewardsController !== hre.ethers.ZeroAddress) {
        console.log(`Rewards controller set: ${rewardsController}`);

        // Refresh reward tokens to ensure all rewards are registered
        console.log(`Refreshing reward tokens for ${wrapperConfig.symbol}...`);

        try {
          const refreshTx = await wrapper.refreshRewardTokens();
          await refreshTx.wait();
          console.log(`Reward tokens refreshed for ${wrapperConfig.symbol}`);
        } catch (error) {
          console.log(`Could not refresh reward tokens: ${error}`);
        }
      } else {
        console.log(
          `No rewards controller configured for ${wrapperConfig.symbol}`,
        );
      }

      // Log wrapper configuration
      const aToken = await wrapper.aToken();
      const asset = await wrapper.asset();
      const name = await wrapper.name();
      const symbol = await wrapper.symbol();
      const decimals = await wrapper.decimals();

      console.log(`Wrapper configuration for ${wrapperConfig.symbol}:`);
      console.log(`  Name: ${name}`);
      console.log(`  Symbol: ${symbol}`);
      console.log(`  Decimals: ${decimals}`);
      console.log(`  aToken: ${aToken}`);
      console.log(`  Underlying asset: ${asset}`);
    } catch (error) {
      console.error(
        `Error configuring ${wrapperConfig.symbol} wrapper:`,
        error,
      );
    }
  }

  // Log factory ownership (note: factory has no admin functions, but we log for completeness)
  try {
    const factoryDeployment = await get(STATIC_ATOKEN_FACTORY_ID);
    const factory = await hre.ethers.getContractAt(
      "StaticATokenFactory",
      factoryDeployment.address,
    );

    console.log(`\nStaticATokenFactory configuration:`);
    console.log(`  Address: ${factoryDeployment.address}`);
    console.log(`  Pool: ${await factory.POOL()}`);

    // Get all deployed static tokens
    const staticTokens = await factory.getStaticATokens();
    console.log(`  Deployed wrappers: ${staticTokens.length}`);

    for (let i = 0; i < staticTokens.length; i++) {
      console.log(`    [${i}]: ${staticTokens[i]}`);
    }
  } catch (error) {
    console.error("Error reading factory configuration:", error);
  }

  console.log(`\n🎁 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["ConfigureStaticATokenWrappers", "aTokenWrapper"];
func.dependencies = ["StaticATokenWrappers"];
