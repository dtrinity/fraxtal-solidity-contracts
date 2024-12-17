import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { SWAP_ROUTER_ID } from "../../utils/dex/deploy-ids";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { FLASH_LOAN_LIQUIDATOR_BORROW_REPAY_AAVE_ID } from "../../utils/liquidator-bot/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);
  const { address: lendingPoolAddressesProviderAddress } =
    await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);

  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    await hre.ethers.getSigner(liquidatorBotDeployer),
  );

  const poolAddress = await addressProviderContract.getPool();

  // In this case, the flash loan lender is the liquidating pool itself
  const flashLoanLender = poolAddress;

  await deployContract(
    hre,
    FLASH_LOAN_LIQUIDATOR_BORROW_REPAY_AAVE_ID,
    [
      assertNotEmpty(flashLoanLender),
      assertNotEmpty(routerAddress),
      assertNotEmpty(lendingPoolAddressesProviderAddress),
      assertNotEmpty(poolAddress),
      config.liquidatorBot.slippageTolerance,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(liquidatorBotDeployer),
    undefined, // no library
    "FlashLoanLiquidatorBorrowRepayAave",
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
func.id = FLASH_LOAN_LIQUIDATOR_BORROW_REPAY_AAVE_ID;
