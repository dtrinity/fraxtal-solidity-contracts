import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { isEqualAddress } from "../../../../utils/address";
import { deployContract } from "../../../../utils/deploy";
import {
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_DATA_PROVIDER_ID,
} from "../../../../utils/lending/deploy-ids";
import { addMarketToRegistry } from "../../../../utils/lending/init-helper";

/**
 * Setup the addresses provider for the market
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/00_setup_addresses_provider.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param marketID - The market ID
 * @param providerID - The provider ID
 * @returns True if the deployment is successful, false otherwise
 */
export async function setupAddressesProvider(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  marketID: string,
  providerID: number,
): Promise<boolean> {
  // 1. Deploy PoolAddressesProvider
  // NOTE: The script passes 0 as market id to create the same address of PoolAddressesProvider
  // in multiple networks via CREATE2. Later in this script it will update the corresponding Market ID.
  const addressesProviderDeployedResult = await deployContract(
    hre,
    POOL_ADDRESSES_PROVIDER_ID,
    ["0", deployer.address],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "PoolAddressesProvider", // The actual contract name
  );

  const addressesProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProviderDeployedResult.address,
    deployer,
  );

  // 2. Set the MarketId
  const setMarketIdResponse =
    await addressesProviderContract.setMarketId(marketID);
  await setMarketIdResponse.wait();

  // 3. Add AddressesProvider to Registry
  await addMarketToRegistry(
    hre,
    providerID,
    addressesProviderDeployedResult.address.toString(),
  );

  // 4. Deploy AaveProtocolDataProvider getters contract
  const protocolDataProviderDeployedResult = await deployContract(
    hre,
    POOL_DATA_PROVIDER_ID,
    [addressesProviderDeployedResult.address],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "AaveProtocolDataProvider", // The actual contract name
  );
  const currentProtocolDataProviderAddress =
    await addressesProviderContract.getPoolDataProvider();

  // Set the ProtocolDataProvider if is not already set at addresses provider
  if (
    !isEqualAddress(
      protocolDataProviderDeployedResult.address.toString(),
      currentProtocolDataProviderAddress,
    )
  ) {
    const setPoolDataProviderResponse =
      await addressesProviderContract.setPoolDataProvider(
        protocolDataProviderDeployedResult.address,
      );
    await setPoolDataProviderResponse.wait();
  }

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
