import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { SWAP_ROUTER_ID } from "../../utils/dex/deploy-ids";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { getReserveTokensAddressesFromAddress } from "../../utils/lending/token";
import { FLASH_MINT_LIQUIDATOR_BORROW_REPAY_AAVE_ID } from "../../utils/liquidator-bot/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  // Get the AToken of the quote token
  // - The flash minter is the ERC20 token contract of the quote token which supports flash minting
  const { aTokenAddress } = await getReserveTokensAddressesFromAddress(
    config.liquidatorBot.flashMinter,
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
    FLASH_MINT_LIQUIDATOR_BORROW_REPAY_AAVE_ID,
    [
      assertNotEmpty(config.liquidatorBot.flashMinter),
      assertNotEmpty(routerAddress),
      assertNotEmpty(lendingPoolAddressesProviderAddress),
      assertNotEmpty(poolAddress),
      assertNotEmpty(aTokenAddress),
      config.liquidatorBot.slippageTolerance,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(liquidatorBotDeployer),
    undefined, // no library
    "FlashMintLiquidatorBorrowRepayAave",
  );

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

export default func;

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
func.id = FLASH_MINT_LIQUIDATOR_BORROW_REPAY_AAVE_ID;
