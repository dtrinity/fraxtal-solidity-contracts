import { getAddress } from "@ethersproject/address";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  ORACLE_ID,
  POOL_ADDRESSES_PROVIDER_ID,
} from "../../../../utils/lending/deploy-ids";

/**
 * Initialize the oracles
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/05_init_oracles.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function initOracles(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
): Promise<boolean> {
  const addressesProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const addressesProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProviderDeployedResult.address,
    deployer,
  );

  // 1. Set price oracle
  const priceOracleAddress = (await hre.deployments.get(ORACLE_ID)).address;
  const statePriceOracle = await addressesProviderContract.getPriceOracle();

  console.log(`---------------`);
  console.log(`Set PriceOracle`);
  console.log(`  - PriceOracle     : ${priceOracleAddress}`);
  console.log(
    `  - AddressProvider : ${addressesProviderDeployedResult.address}`,
  );

  if (getAddress(priceOracleAddress) === getAddress(statePriceOracle)) {
    console.log("[addresses-provider] Price oracle already set. Skipping tx.");
  } else {
    const setPriceOracleResponse =
      await addressesProviderContract.setPriceOracle(priceOracleAddress);
    const setPriceOracleReceipt = await setPriceOracleResponse.wait();
    console.log(`  - TxHash  : ${setPriceOracleReceipt?.hash}`);
    console.log(`  - From    : ${setPriceOracleReceipt?.from}`);
    console.log(`  - GasUsed : ${setPriceOracleReceipt?.gasUsed.toString()}`);
    console.log(
      `[Deployment] Added PriceOracle ${priceOracleAddress} to PoolAddressesProvider`,
    );
  }
  console.log(`---------------`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
