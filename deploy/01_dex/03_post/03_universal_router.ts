import { keccak256 } from "@ethersproject/solidity";
import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { UNISWAP_UNIVERSAL_ROUTER_ID, UNISWAP_V3_FACTORY_ID } from "../../../utils/dex/deploy-ids";
import { getPermit2Address } from "../../../utils/dex/permit2";
import { isMainnetNetwork } from "../../../utils/utils";
import { getWETH9Address } from "../../../utils/weth9";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (isMainnetNetwork(hre.network.name)) {
    console.log("Skipping deployment on mainnet");
    return false;
  }

  const config = await getConfig(hre);

  // Skip deployment if dex config is not populated
  if (!config.dex) {
    console.log("Skipping Universal Router deployment - dex config not populated");
    return false;
  }
  const { dexDeployer } = await hre.getNamedAccounts();

  const weth9Address = await getWETH9Address(hre);
  const permit2Address = await getPermit2Address(hre);
  const { address: dexFactoryAddress } = await hre.deployments.get(UNISWAP_V3_FACTORY_ID);

  const poolContractArtifact = await hre.deployments.getArtifact("UniswapV3Pool");
  const poolInitCodeHash = keccak256(["bytes"], [`${poolContractArtifact.bytecode}`]);

  await deployContract(
    hre,
    UNISWAP_UNIVERSAL_ROUTER_ID,
    [
      {
        /* eslint-disable camelcase -- Use camelcase for params  */
        permit2: permit2Address,
        weth9: weth9Address,
        seaportV1_5: ZeroAddress,
        seaportV1_4: ZeroAddress,
        openseaConduit: ZeroAddress,
        nftxZap: ZeroAddress,
        x2y2: ZeroAddress,
        foundation: ZeroAddress,
        sudoswap: ZeroAddress,
        elementMarket: ZeroAddress,
        nft20Zap: ZeroAddress,
        cryptopunks: ZeroAddress,
        looksRareV2: ZeroAddress,
        routerRewardsDistributor: ZeroAddress,
        looksRareRewardsDistributor: ZeroAddress,
        looksRareToken: ZeroAddress,
        v3Factory: dexFactoryAddress,
        poolInitCodeHash: poolInitCodeHash,
        /* eslint-enable camelcase -- Use camelcase for params */
      },
    ],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "UniversalRouter",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = UNISWAP_UNIVERSAL_ROUTER_ID;
func.tags = ["dex", "dex-ui"];
export default func;
