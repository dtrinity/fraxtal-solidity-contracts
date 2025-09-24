import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { dUSD_A_TOKEN_WRAPPER_ID } from "../../typescript/deploy-ids";
import { POOL_DATA_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { STATIC_ATOKEN_FACTORY_ID } from "./01_deploy_static_atoken_factory";

// Use the deployment IDs from the central location
export const DUSD_STATIC_ATOKEN_ID = dUSD_A_TOKEN_WRAPPER_ID;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { get } = deployments;
  const { lendingDeployer } = await getNamedAccounts();
  const signer = await hre.ethers.getSigner(lendingDeployer);

  console.log(`Starting deployment of StaticATokenLM wrappers...`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`Deployer: ${lendingDeployer}`);

  // Get config for current network
  const config = await getConfig(hre);

  // Get deployed StaticATokenFactory
  const factoryDeployment = await get(STATIC_ATOKEN_FACTORY_ID);
  const factory = await hre.ethers.getContractAt("StaticATokenFactory", factoryDeployment.address, signer);
  console.log(`StaticATokenFactory address: ${factoryDeployment.address}`);

  // Get data provider to fetch aToken addresses
  const dataProviderDeployment = await get(POOL_DATA_PROVIDER_ID);
  const dataProvider = await hre.ethers.getContractAt("AaveProtocolDataProvider", dataProviderDeployment.address);

  // Define the underlying assets to wrap (dS removed for Fraxtal)
  const assetsToWrap = [
    {
      symbol: "dUSD",
      address: config.dusd.address,
      deploymentId: DUSD_STATIC_ATOKEN_ID,
      tag: "dUSD-aTokenWrapper",
    },
  ];

  const deployedWrappers: { [key: string]: string } = {};

  for (const asset of assetsToWrap) {
    if (!asset.address) {
      console.log(`Skipping ${asset.symbol} - no address configured`);
      continue;
    }

    console.log(`\nProcessing ${asset.symbol}...`);
    console.log(`Underlying asset address: ${asset.address}`);

    try {
      // Get aToken address for the underlying asset
      const { aTokenAddress } = await dataProvider.getReserveTokensAddresses(asset.address);
      console.log(`aToken address for ${asset.symbol}: ${aTokenAddress}`);

      if (aTokenAddress === hre.ethers.ZeroAddress) {
        console.log(`No aToken found for ${asset.symbol}, skipping...`);
        continue;
      }

      // Check if wrapper already exists
      const existingWrapper = await factory.getStaticAToken(asset.address);

      if (existingWrapper !== hre.ethers.ZeroAddress) {
        console.log(`StaticATokenLM wrapper for ${asset.symbol} already exists at ${existingWrapper}`);
        deployedWrappers[asset.deploymentId] = existingWrapper;

        // Save deployment artifact for existing wrapper
        await deployments.save(asset.deploymentId, {
          address: existingWrapper,
          abi: (await deployments.getArtifact("StaticATokenLM")).abi,
        });
        continue;
      }

      // Create new wrapper
      console.log(`Creating StaticATokenLM wrapper for ${asset.symbol}...`);
      const tx = await factory.createStaticATokens([asset.address]);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error(`Transaction failed for ${asset.symbol}`);
      }

      // Get the deployed wrapper address
      const wrapperAddress = await factory.getStaticAToken(asset.address);
      console.log(`StaticATokenLM wrapper for ${asset.symbol} deployed at ${wrapperAddress}`);
      deployedWrappers[asset.deploymentId] = wrapperAddress;

      // Save deployment artifact
      await deployments.save(asset.deploymentId, {
        address: wrapperAddress,
        abi: (await deployments.getArtifact("StaticATokenLM")).abi,
      });
    } catch (error) {
      console.error(`Error processing ${asset.symbol}:`, error);
    }
  }

  console.log("\nDeployment Summary:");
  console.log("==================");

  for (const [deploymentId, address] of Object.entries(deployedWrappers)) {
    console.log(`${deploymentId}: ${address}`);
  }

  console.log(`\n🎁 ${__filename.split("/").slice(-2).join("/")}: ✅`);
};

export default func;
func.tags = ["StaticATokenWrappers", "aTokenWrapper", "dUSD-aTokenWrapper"];
func.dependencies = ["StaticATokenFactory", "lbp-init-reserves", "dStable"];
