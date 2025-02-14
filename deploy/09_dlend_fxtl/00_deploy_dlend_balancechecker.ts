import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../utils/deploy";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../utils/lending/constants";
import {
  DLEND_BALANCE_CHECKER_ID,
  POOL_ADDRESSES_PROVIDER_ID,
} from "../../utils/lending/deploy-ids";

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

  await deployContract(
    hre,
    DLEND_BALANCE_CHECKER_ID,
    [poolAddress],
    undefined,
    await hre.ethers.getSigner(lendingDeployer),
  );

  return true;
};

func.id = `${DLEND_BALANCE_CHECKER_ID}:${MARKET_NAME}:${LENDING_CORE_VERSION}`;
func.tags = ["dLendBalanceChecker", "fxtl"];
func.dependencies = [POOL_ADDRESSES_PROVIDER_ID];

export default func;
