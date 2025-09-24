import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This test script is only for localhost network");
    return true;
  }

  const { dusdDeployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const config = await getConfig(hre);

  console.log("Testing RedeemerWithFees deployment on localhost...");

  // Deploy mock dependencies for testing
  // Deploy mock oracle aggregator (dS removed for Fraxtal)
  const mockUSDOracle = await deploy("MockUSDOracle", {
    from: dusdDeployer,
    contract: "OracleAggregator",
    args: [config.oracleAggregator.priceDecimals],
    log: true,
  });

  // Deploy mock collateral vault (dS removed for Fraxtal)
  const mockDUSDVault = await deploy("MockDUSDVault", {
    from: dusdDeployer,
    contract: "CollateralHolderVault",
    args: [mockUSDOracle.address],
    log: true,
  });

  // Deploy mock tokens if needed (dS removed for Fraxtal)
  const dUSD = await hre.deployments.getOrNull("dUSD");

  if (!dUSD) {
    console.log("dUSD token not found, skipping RedeemerWithFees test");
    return true;
  }

  // Deploy RedeemerWithFees for dUSD
  const dUSDConfig = config.dStables?.dUSD;

  if (dUSDConfig) {
    const dUSDRedeemerWithFees = await deploy("TestDUSDRedeemerWithFees", {
      from: dusdDeployer,
      contract: "RedeemerWithFees",
      args: [mockDUSDVault.address, dUSD.address, mockUSDOracle.address, dUSDConfig.initialFeeReceiver, dUSDConfig.initialRedemptionFeeBps],
      log: true,
    });

    console.log(`✅ dUSD RedeemerWithFees deployed at: ${dUSDRedeemerWithFees.address}`);
    console.log(`   Fee Receiver: ${dUSDConfig.initialFeeReceiver}`);
    console.log(`   Default Fee: ${dUSDConfig.initialRedemptionFeeBps} bps`);
  }

  // dS RedeemerWithFees deployment removed for Fraxtal

  // Test fee configuration
  if (dUSDConfig?.collateralRedemptionFees) {
    console.log("\n📋 dUSD Collateral-specific fees configured:");

    for (const [collateral, feeBps] of Object.entries(dUSDConfig.collateralRedemptionFees)) {
      console.log(`   ${collateral}: ${feeBps} bps`);
    }
  }

  // dS fee configuration removed for Fraxtal

  console.log("\n✅ RedeemerWithFees test deployment completed successfully!");
  console.log("☯️  09_redeemer_with_fees/00_test_redeemer_with_fees.ts: ✅");

  return true;
};

func.id = "test_redeemer_with_fees_deployment";
func.tags = ["test-redeemer", "redeemerWithFees"];
func.dependencies = ["dstable-tokens"];

export default func;
