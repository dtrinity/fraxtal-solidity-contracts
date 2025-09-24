import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { TOKEN_INFO } from "../../config/networks/fraxtal_mainnet";
import { symbolsToAddresses } from "../../utils/token";
import { isMainnetNetwork } from "../../utils/utils";

const configureAssetsByOracleType = {
  curveApi3CompositeOracles: ["FXB20261231"],
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log("This deployment is only for mainnet");
    return false;
  }

  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dusdDeployer);

  const config = await getConfig(hre);

  const { address: curveCompositeWrapperWithThresholdingAddress } = await hre.deployments.get("CurveAPI3CompositeWrapperWithThresholding");
  const curveCompositeWrapper = await hre.ethers.getContractAt(
    "CurveAPI3CompositeWrapperWithThresholding",
    curveCompositeWrapperWithThresholdingAddress,
    deployer,
  );

  // -----------------------------------------------------------------------------
  // Permission check: ensure the deployer has ORACLE_MANAGER_ROLE, otherwise abort
  // -----------------------------------------------------------------------------

  const oracleManagerRole = await curveCompositeWrapper.ORACLE_MANAGER_ROLE();
  const hasPermission = await curveCompositeWrapper.hasRole(oracleManagerRole, deployer.address);

  if (!hasPermission) {
    throw new Error(
      `Deployer ${deployer.address} lacks ORACLE_MANAGER_ROLE on CurveAPI3CompositeWrapperWithThresholding. ` +
        `Grant the role or run this migration with an account that has it.`,
    );
  }

  const curveAddresses = symbolsToAddresses(configureAssetsByOracleType.curveApi3CompositeOracles, TOKEN_INFO);
  const curveCompositeFeeds = Object.fromEntries(
    Object.entries(config.oracleAggregator.curveOracleAssets.curveApi3CompositeOracles).filter(([key]) => curveAddresses.includes(key)),
  );

  for (const [assetAddress, feedConfig] of Object.entries(curveCompositeFeeds)) {
    await curveCompositeWrapper.setAssetConfig(assetAddress, feedConfig.pool);
    console.log(`Set Curve pool config for asset ${assetAddress}:`, `\n  - Pool: ${feedConfig.pool}`);

    await curveCompositeWrapper.setCompositeFeed(
      assetAddress,
      feedConfig.compositeAPI3Feed.api3Asset,
      feedConfig.compositeAPI3Feed.api3Proxy,
      feedConfig.compositeAPI3Feed.curveLowerThresholdInBase,
      feedConfig.compositeAPI3Feed.curveFixedPriceInBase,
      feedConfig.compositeAPI3Feed.api3LowerThresholdInBase,
      feedConfig.compositeAPI3Feed.api3FixedPriceInBase,
    );
    console.log(
      `Set Curve composite API3 feed for asset ${assetAddress}:`,
      `\n  - API3 asset: ${feedConfig.compositeAPI3Feed.api3Asset}`,
      `\n  - API3 wrapper: ${feedConfig.compositeAPI3Feed.api3Proxy}`,
      `\n  - Curve lower threshold: ${feedConfig.compositeAPI3Feed.curveLowerThresholdInBase}`,
      `\n  - Curve fixed price: ${feedConfig.compositeAPI3Feed.curveFixedPriceInBase}`,
      `\n  - API3 lower threshold: ${feedConfig.compositeAPI3Feed.api3LowerThresholdInBase}`,
      `\n  - API3 fixed price: ${feedConfig.compositeAPI3Feed.api3FixedPriceInBase}`,
    );
  }

  return true;
};

func.tags = ["oracle-wrapper", "api3-oracle-wrapper", "curve-oracle-wrapper", "fxb-2026"];
func.dependencies = [];
func.id = "DeployCurveOracleWrapperFXB20261231";

export default func;
