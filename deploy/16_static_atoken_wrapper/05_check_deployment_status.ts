import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { STATIC_ATOKEN_FACTORY_ID } from "./01_deploy_static_atoken_factory";
import { DUSD_STATIC_ATOKEN_ID } from "./02_deploy_static_atoken_wrappers";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;

  console.log(`\n🔍 Checking StaticATokenLM deployment status...`);
  console.log(`Network: ${hre.network.name}`);
  console.log(`${"=".repeat(50)}`);

  // Get config
  const config = await getConfig(hre);

  // Check factory deployment
  console.log("\n📦 StaticATokenFactory:");
  const factoryDeployment = await deployments.getOrNull(STATIC_ATOKEN_FACTORY_ID);

  if (factoryDeployment) {
    console.log(`  ✅ Deployed at: ${factoryDeployment.address}`);

    const factory = await hre.ethers.getContractAt("StaticATokenFactory", factoryDeployment.address);

    const pool = await factory.POOL();
    console.log(`  📍 Pool: ${pool}`);

    const staticTokens = await factory.getStaticATokens();
    console.log(`  📊 Total wrappers deployed: ${staticTokens.length}`);
  } else {
    console.log(`  ❌ Not deployed`);
  }

  // Check wrapper deployments (dS removed for Fraxtal)
  const wrappers = [
    {
      name: "dUSD",
      deploymentId: DUSD_STATIC_ATOKEN_ID,
      underlyingAddress: config.dusd.address,
    },
  ];

  console.log("\n📦 StaticATokenLM Wrappers:");

  for (const wrapper of wrappers) {
    console.log(`\n  ${wrapper.name} Wrapper:`);

    const deployment = await deployments.getOrNull(wrapper.deploymentId);

    if (deployment) {
      console.log(`    ✅ Deployed at: ${deployment.address}`);

      try {
        const wrapperContract = await hre.ethers.getContractAt("StaticATokenLM", deployment.address);

        const [name, symbol, decimals, aToken, underlying, pool, rewardsController] = await Promise.all([
          wrapperContract.name(),
          wrapperContract.symbol(),
          wrapperContract.decimals(),
          wrapperContract.aToken(),
          wrapperContract.asset(),
          wrapperContract.POOL(),
          wrapperContract.REWARDS_CONTROLLER(),
        ]);

        console.log(`    📄 Name: ${name}`);
        console.log(`    🏷️  Symbol: ${symbol}`);
        console.log(`    🔢 Decimals: ${decimals}`);
        console.log(`    🪙  aToken: ${aToken}`);
        console.log(`    💰 Underlying: ${underlying}`);
        console.log(`    🏊 Pool: ${pool}`);
        console.log(`    🎁 Rewards Controller: ${rewardsController}`);

        // Check if it's registered in factory
        if (factoryDeployment && wrapper.underlyingAddress) {
          const factory = await hre.ethers.getContractAt("StaticATokenFactory", factoryDeployment.address);
          const registeredWrapper = await factory.getStaticAToken(wrapper.underlyingAddress);

          if (registeredWrapper === deployment.address) {
            console.log(`    ✅ Registered in factory`);
          } else if (registeredWrapper === hre.ethers.ZeroAddress) {
            console.log(`    ❌ Not registered in factory`);
          } else {
            console.log(`    ⚠️  Factory has different wrapper: ${registeredWrapper}`);
          }
        }

        // Check total supply
        const totalSupply = await wrapperContract.totalSupply();
        console.log(`    💎 Total Supply: ${hre.ethers.formatUnits(totalSupply, decimals)}`);
      } catch (error) {
        console.log(`    ⚠️  Error reading contract data: ${error}`);
      }
    } else {
      console.log(`    ❌ Not deployed`);
    }
  }

  // Check if wrappers are ready for dSTAKE integration
  console.log("\n🔗 dSTAKE Integration Status:");

  const dUSDWrapper = await deployments.getOrNull(DUSD_STATIC_ATOKEN_ID);

  if (dUSDWrapper) {
    console.log(`  ✅ dUSD wrapper ready for dSTAKE`);
  } else {
    console.log(`  ❌ dUSD wrapper not deployed`);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`🎁 Deployment status check complete`);
};

export default func;
func.tags = ["CheckStaticATokenStatus"];
func.dependencies = [];
func.runAtTheEnd = true;
func.id = "CheckStaticATokenStatus";
