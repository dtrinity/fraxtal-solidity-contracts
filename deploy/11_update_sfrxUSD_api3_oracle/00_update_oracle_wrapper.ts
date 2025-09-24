import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { TOKEN_INFO } from "../../config/networks/fraxtal_mainnet";
import { symbolsToAddresses } from "../../utils/token";
import { isMainnetNetwork } from "../../utils/utils";

const configureAssetsByOracleType = {
  compositeApi3OracleWrappersWithThresholding: ["sfrxUSD"],
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log("This deployment is only for mainnet");
    return false;
  }

  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dusdDeployer);

  const config = await getConfig(hre);

  const { address: api3CompositeWrapperWithThresholdingAddress } = await hre.deployments.get("API3CompositeWrapperWithThresholding");
  const api3CompositeWrapper = await hre.ethers.getContractAt(
    "API3CompositeWrapperWithThresholding",
    api3CompositeWrapperWithThresholdingAddress,
    deployer,
  );

  const compositeAddresses = symbolsToAddresses(configureAssetsByOracleType.compositeApi3OracleWrappersWithThresholding, TOKEN_INFO);
  const compositeFeeds = Object.fromEntries(
    Object.entries(config.oracleAggregator.api3OracleAssets.compositeApi3OracleWrappersWithThresholding).filter(([key]) =>
      compositeAddresses.includes(key),
    ),
  );

  for (const [assetAddress, feedConfig] of Object.entries(compositeFeeds)) {
    // Using addCompositeFeed instead of updateCompositeFeed because we need to repoint the proxy address
    await api3CompositeWrapper.addCompositeFeed(
      feedConfig.feedAsset,
      feedConfig.proxy1,
      feedConfig.proxy2,
      feedConfig.lowerThresholdInBase1,
      feedConfig.fixedPriceInBase1,
      feedConfig.lowerThresholdInBase2,
      feedConfig.fixedPriceInBase2,
    );
    console.log(
      `Set composite API3 feed for asset ${assetAddress} with:`,
      `\n  - Proxy1: ${feedConfig.proxy1}`,
      `\n  - Proxy2: ${feedConfig.proxy2}`,
      `\n  - Lower threshold in base1: ${feedConfig.lowerThresholdInBase1}`,
      `\n  - Fixed price in base1: ${feedConfig.fixedPriceInBase1}`,
      `\n  - Lower threshold in base2: ${feedConfig.lowerThresholdInBase2}`,
      `\n  - Fixed price in base2: ${feedConfig.fixedPriceInBase2}`,
    );
  }

  return true;
};

func.tags = ["oracle-wrapper", "api3-oracle-wrapper", "update-sfrax-to-sfrxUSD"];
func.dependencies = [];
func.id = "UpdateSfrxUSDOracleWrapper";

export default func;
