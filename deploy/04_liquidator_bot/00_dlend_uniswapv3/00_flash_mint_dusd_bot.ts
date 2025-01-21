import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { SWAP_ROUTER_ID } from "../../../utils/dex/deploy-ids";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../../utils/lending/deploy-ids";
import { getReserveTokensAddressesFromAddress } from "../../../utils/lending/token";
import { FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID } from "../../../utils/liquidator-bot/uniswap-v3/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  if (!config.liquidatorBotUniswapV3) {
    console.log("Liquidator bot Uniswap V3 config is not found");
    return false;
  }

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  // Get the AToken of the quote token
  // - The flash minter is the ERC20 token contract of the quote token which supports flash minting
  const { aTokenAddress } = await getReserveTokensAddressesFromAddress(
    config.liquidatorBotUniswapV3.flashMinter,
  );

  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  const poolAddress = await addressProviderContract.getPool();

  await deployContract(
    hre,
    FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID,
    [
      assertNotEmpty(config.liquidatorBotUniswapV3.flashMinter),
      assertNotEmpty(lendingPoolAddressesProviderAddress),
      assertNotEmpty(poolAddress),
      assertNotEmpty(aTokenAddress),
      config.liquidatorBotUniswapV3.slippageTolerance,
      assertNotEmpty(routerAddress),
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(liquidatorBotDeployer),
    undefined, // no library
    "FlashMintLiquidatorAaveBorrowRepayUniswapV3",
  );

  // Set the proxy contract
  const flashMintLiquidatorBotDeployedResult = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID,
  );
  const flashMintLiquidatorBotContract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayUniswapV3",
    flashMintLiquidatorBotDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  // Set proxy contracts if they exist in config
  if (config.liquidatorBotUniswapV3.proxyContractMap) {
    for (const [token, proxyContract] of Object.entries(
      config.liquidatorBotUniswapV3.proxyContractMap,
    )) {
      await flashMintLiquidatorBotContract.setProxyContract(
        token,
        proxyContract,
      );
    }
  }

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

/**
 * Assert that the value is not empty
 *
 * @param value - The value to assert
 * @returns The input value if it is not empty
 */
function assertNotEmpty(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }

  if (value.trim() === "") {
    throw new Error("Trimmed value is empty");
  }

  if (value.length === 0) {
    throw new Error("Value is empty");
  }
  return value;
}

func.tags = ["liquidator-bot"];
func.dependencies = [];
func.id = FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID;

export default func;
