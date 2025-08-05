import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../utils/deploy";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../utils/lending/constants";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";

const NEW_DLEND_BALANCE_CHECKER_ID = "DLendBalanceChecker_New";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const { lendingDeployer } = await hre.getNamedAccounts();

  // Get PoolAddressesProvider from deployments
  const addressesProvider = await deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressesProviderInstance = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProvider.address,
  );

  const poolAddress = await addressesProviderInstance.getPool();

  if (poolAddress === hre.ethers.ZeroAddress) {
    throw new Error("Pool address not set in PoolAddressesProvider");
  }

  console.log(`Deploying new DLendBalanceChecker with pool: ${poolAddress}`);

  await deployContract(
    hre,
    NEW_DLEND_BALANCE_CHECKER_ID,
    [poolAddress],
    undefined,
    await hre.ethers.getSigner(lendingDeployer),
    undefined,
    "contracts/fxtl_balance_checkers/implementations/DLendBalanceChecker.sol:DLendBalanceChecker",
  );

  console.log(`🥩 ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = `${NEW_DLEND_BALANCE_CHECKER_ID}:${MARKET_NAME}:${LENDING_CORE_VERSION}`;
func.tags = ["DLendBalanceChecker", "new", "fxtl-balance-checkers"];
func.dependencies = [POOL_ADDRESSES_PROVIDER_ID];

export default func;
