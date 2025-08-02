import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { TOKEN_INFO } from "../../config/networks/fraxtal_mainnet";
import {
  CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../utils/oracle/deploy-ids";
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

  // Calculate the acceptable price range (0.5 - 1 USD)
  const baseCurrencyUnit =
    BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals);
  const minAcceptablePrice = baseCurrencyUnit / 2n; // 0.5 USD
  const maxAcceptablePrice = baseCurrencyUnit; // 1 USD

  // Get OracleAggregator contract
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregatorContract = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    deployer,
  );

  // Get CurveAPI3CompositeWrapperWithThresholding contract
  const { address: curveCompositeWrapperAddress } = await hre.deployments.get(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  );
  const curveCompositeWrapperContract = await hre.ethers.getContractAt(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
    curveCompositeWrapperAddress,
    deployer,
  );

  // Set Curve composite API3 oracle wrappers
  const curveAddresses = symbolsToAddresses(
    configureAssetsByOracleType.curveApi3CompositeOracles,
    TOKEN_INFO,
  );
  const curveCompositeFeeds = Object.fromEntries(
    Object.entries(
      config.oracleAggregator.curveOracleAssets.curveApi3CompositeOracles,
    ).filter(([key]) => curveAddresses.includes(key)),
  );

  for (const [assetAddress, _feedConfig] of Object.entries(
    curveCompositeFeeds,
  )) {
    // Validate the new wrapper before pointing
    const testPrice =
      await curveCompositeWrapperContract.getAssetPrice(assetAddress);

    // Sanity check: price should be in the range [0.5, 1] USD (inclusive)
    if (testPrice < minAcceptablePrice || testPrice > maxAcceptablePrice) {
      throw new Error(
        `Sanity check failed for ${assetAddress}: price ${testPrice.toString()} is outside the acceptable range [${minAcceptablePrice.toString()}, ${maxAcceptablePrice.toString()}]`,
      );
    }
    console.log(
      `Pointing OracleAggregator for ${assetAddress} to`,
      curveCompositeWrapperAddress,
    );
    await oracleAggregatorContract.setOracle(
      assetAddress,
      curveCompositeWrapperAddress,
    );
  }

  return true;
};

func.tags = [
  "oracle-aggregator",
  "point-api3-oracle-wrapper",
  "point-curve-oracle-wrapper",
  "fxb-2026",
];
func.dependencies = [
  "DeployCurveOracleWrapperFXB20261231",
  ORACLE_AGGREGATOR_ID,
];
func.id = "PointCurveOracleWrapperFXB20261231";

export default func;
