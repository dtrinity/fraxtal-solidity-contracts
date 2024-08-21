import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  L2_POOL_IMPL_ID,
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_CONFIGURATOR_IMPL_ID,
  POOL_CONFIGURATOR_PROXY_ID,
  POOL_PROXY_ID,
} from "../../../../utils/lending/deploy-ids";

/**
 * Initialize the Pool
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/06_init_pool.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param flashLoanPremium - Flash loan premiums
 * @param flashLoanPremium.total - Total flash loan premium
 * @param flashLoanPremium.protocol - Protocol flash loan premium
 * @returns True if the deployment is successful, false otherwise
 */
export async function initPool(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  flashLoanPremium: {
    total: number;
    protocol: number;
  },
): Promise<boolean> {
  const proxyArtifact = await hre.deployments.getExtendedArtifact(
    "InitializableImmutableAdminUpgradeabilityProxy",
  );

  const poolImplDeployment = await hre.deployments.get(L2_POOL_IMPL_ID);

  const poolConfiguratorImplDeployment = await hre.deployments.get(
    POOL_CONFIGURATOR_IMPL_ID,
  );

  const { address: addressesProviderAddress } = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const addressesProviderInstance = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProviderAddress,
    deployer,
  );

  const isPoolProxyPending =
    (await addressesProviderInstance.getPool()) === ZeroAddress;

  // Set Pool implementation to Addresses provider and save the proxy deployment artifact at disk
  if (isPoolProxyPending) {
    console.log(`------------------------------------------------`);
    console.log(`Set Pool implementation on PoolAddressesProvider`);
    console.log(`  - Pool implementation : ${poolImplDeployment.address}`);
    console.log(`  - Address Provider    : ${addressesProviderAddress}`);
    const setPoolImplTx = await addressesProviderInstance.setPoolImpl(
      poolImplDeployment.address,
    );
    const setPoolImplReceipt = await setPoolImplTx.wait();
    console.log(`  - TxHash  : ${setPoolImplReceipt?.hash}`);
    console.log(`  - From    : ${setPoolImplReceipt?.from}`);
    console.log(`  - GasUsed : ${setPoolImplReceipt?.gasUsed.toString()}`);
    console.log(`------------------------------------------------`);
  }

  const poolAddressProviderAddress = await addressesProviderInstance.getPool();
  hre.deployments.log(
    "Deployed PoolAddressesProvider:",
    poolAddressProviderAddress,
  );

  await hre.deployments.save(POOL_PROXY_ID, {
    ...proxyArtifact,
    address: poolAddressProviderAddress,
  });

  const isPoolConfiguratorProxyPending =
    (await addressesProviderInstance.getPoolConfigurator()) === ZeroAddress;

  // Set Pool Configurator to Addresses Provider proxy deployment artifact at disk
  if (isPoolConfiguratorProxyPending) {
    // const setPoolConfiguratorTx = await waitForTx(
    //   await addressesProviderInstance.setPoolConfiguratorImpl(
    //     poolConfiguratorImplDeployment.address
    //   )
    // );
    console.log(`-----------------------------------`);
    console.log(`Set PoolConfigurator implementation`);
    console.log(
      `  - PoolConfigurator implementation : ${poolConfiguratorImplDeployment.address}`,
    );
    console.log(
      `  - Address Provider                : ${addressesProviderAddress}`,
    );
    const setPoolConfiguratorTx =
      await addressesProviderInstance.setPoolConfiguratorImpl(
        poolConfiguratorImplDeployment.address,
      );
    const setPoolConfiguratorReceipt = await setPoolConfiguratorTx.wait();
    console.log(`  - TxHash  : ${setPoolConfiguratorReceipt?.hash}`);
    console.log(`  - From    : ${setPoolConfiguratorReceipt?.from}`);
    console.log(
      `  - GasUsed : ${setPoolConfiguratorReceipt?.gasUsed.toString()}`,
    );
    console.log(`[Deployment] Attached PoolConfigurator to Address Provider`);
    console.log(`-----------------------------------`);
  }
  const poolConfiguratorProxyAddress =
    await addressesProviderInstance.getPoolConfigurator();

  console.log("Deployed Proxy:", poolConfiguratorProxyAddress);

  await hre.deployments.save(POOL_CONFIGURATOR_PROXY_ID, {
    ...proxyArtifact,
    address: poolConfiguratorProxyAddress,
  });

  // Set Flash Loan premiums
  const poolConfiguratorContract = await hre.ethers.getContractAt(
    "PoolConfigurator",
    poolConfiguratorProxyAddress,
    deployer,
  );

  // Set total Flash Loan Premium
  console.log(`------------------------------`);
  console.log(`Update Flashloan Premium Total`);
  console.log(`  - Pool Configurator       : ${poolConfiguratorProxyAddress}`);
  console.log(`  - Flashloan Premium Total : ${flashLoanPremium.total}`);
  const updateFlashloanPremiumTotalResponse =
    await poolConfiguratorContract.updateFlashloanPremiumTotal(
      flashLoanPremium.total,
    );
  const updateFlashloanPremiumTotalReceipt =
    await updateFlashloanPremiumTotalResponse.wait();
  console.log(`  - TxHash  : ${updateFlashloanPremiumTotalReceipt?.hash}`);
  console.log(`  - From    : ${updateFlashloanPremiumTotalReceipt?.from}`);
  console.log(
    `  - GasUsed : ${updateFlashloanPremiumTotalReceipt?.gasUsed.toString()}`,
  );
  console.log(`------------------------------`);

  // Set protocol Flash Loan Premium
  console.log(`---------------------------------`);
  console.log(`Update Flashloan Premium Protocol`);
  console.log(
    `  - Pool Configurator          : ${poolConfiguratorProxyAddress}`,
  );
  console.log(`  - Flashloan Premium Protocol : ${flashLoanPremium.protocol}`);
  const updateFlashloanPremiumToProtocolResponse =
    await poolConfiguratorContract.updateFlashloanPremiumToProtocol(
      flashLoanPremium.protocol,
    );
  const updateFlashloanPremiumToProtocolReceipt =
    await updateFlashloanPremiumToProtocolResponse.wait();
  console.log(`  - TxHash  : ${updateFlashloanPremiumToProtocolReceipt?.hash}`);
  console.log(`  - From    : ${updateFlashloanPremiumToProtocolReceipt?.from}`);
  console.log(
    `  - GasUsed : ${updateFlashloanPremiumToProtocolReceipt?.gasUsed.toString()}`,
  );
  console.log(`---------------------------------`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
