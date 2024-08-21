import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import { ZERO_BYTES_32 } from "../../../../utils/lending/constants";
import {
  ACL_MANAGER_ID,
  POOL_ADDRESSES_PROVIDER_ID,
} from "../../../../utils/lending/deploy-ids";

/**
 * Initialize the ACL Manager
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/03_init_acl.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signe
 * @param poolAdmin - The pool admin signer
 * @param aclAdmin - The ACL admin signer
 * @param emergencyAdmin - The emergency admin signer
 * @returns True if the deployment is successful, false otherwise
 */
export async function initACLManager(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  poolAdmin: HardhatEthersSigner,
  aclAdmin: HardhatEthersSigner,
  emergencyAdmin: HardhatEthersSigner,
): Promise<boolean> {
  const addressesProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  const addressesProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressesProviderDeployedResult.address,
    deployer,
  );

  // 1. Set ACL admin on AddressesProvider
  console.log(`----------------------------------`);
  console.log(`Set ACL admin on AddressesProvider`);
  console.log(
    `  - Address Provider: ${addressesProviderDeployedResult.address}`,
  );
  console.log(`  - ACL Admin       : ${aclAdmin.address}`);
  const setACLAdminResponse = await addressesProviderContract.setACLAdmin(
    aclAdmin.address,
  );
  const setACLAdminReceipt = await setACLAdminResponse.wait();
  console.log(`  - TxHash  : ${setACLAdminReceipt?.hash}`);
  console.log(`  - From    : ${setACLAdminReceipt?.from}`);
  console.log(`  - GasUsed : ${setACLAdminReceipt?.gasUsed.toString()}`);
  console.log(`----------------------------------`);

  // 2. Deploy ACLManager and setup administrators
  const aclManagerDeployedResult = await deployContract(
    hre,
    ACL_MANAGER_ID,
    [addressesProviderDeployedResult.address],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "ACLManager", // The actual contract name
  );

  const aclManagerContract = await hre.ethers.getContractAt(
    "ACLManager",
    aclManagerDeployedResult.address,
    aclAdmin,
  );

  // 3. Setup ACLManager for for AddressProvider
  console.log(`----------------------------------------`);
  console.log(`Setup ACLManager for for AddressProvider`);
  console.log(
    `  - Address Provider: ${addressesProviderDeployedResult.address}`,
  );
  console.log(`  - ACL Manager     : ${aclManagerDeployedResult.address}`);
  const setACLManagerResponse = await addressesProviderContract.setACLManager(
    await aclManagerContract.getAddress(),
  );
  const setACLManagerReceipt = await setACLManagerResponse.wait();
  console.log(`  - TxHash  : ${setACLManagerReceipt?.hash}`);
  console.log(`  - From    : ${setACLManagerReceipt?.from}`);
  console.log(`  - GasUsed : ${setACLManagerReceipt?.gasUsed.toString()}`);
  console.log(`----------------------------------------`);

  // 4. Add PoolAdmin to ACLManager
  console.log(`-----------------------------`);
  console.log(`Add Pool Admin to ACL Manager`);
  console.log(`  - ACL Manager : ${aclManagerDeployedResult.address}`);
  console.log(`  - Pool Admin  : ${poolAdmin.address}`);
  const addPoolAdminResponse = await aclManagerContract.addPoolAdmin(
    poolAdmin.address,
  );
  const addPoolAdminReceipt = await addPoolAdminResponse.wait();
  console.log(`  - TxHash  : ${addPoolAdminReceipt?.hash}`);
  console.log(`  - From    : ${addPoolAdminReceipt?.from}`);
  console.log(`  - GasUsed : ${addPoolAdminReceipt?.gasUsed.toString()}`);
  console.log(`-----------------------------`);

  // 5. Add EmergencyAdmin  to ACLManager
  console.log(`----------------------------------`);
  console.log(`Add Emergency Admin to ACL Manager`);
  console.log(`  - ACL Manager     : ${aclManagerDeployedResult.address}`);
  console.log(`  - Emergency Admin : ${emergencyAdmin.address}`);
  const addEmergencyAdminResponse = await aclManagerContract.addEmergencyAdmin(
    emergencyAdmin.address,
  );
  const addEmergencyAdminReceipt = await addEmergencyAdminResponse.wait();
  console.log(`  - TxHash  : ${addEmergencyAdminReceipt?.hash}`);
  console.log(`  - From    : ${addEmergencyAdminReceipt?.from}`);
  console.log(`  - GasUsed : ${addEmergencyAdminReceipt?.gasUsed.toString()}`);
  console.log(`----------------------------------`);

  const isACLAdmin = await aclManagerContract.hasRole(ZERO_BYTES_32, aclAdmin);
  const isPoolAdmin = await aclManagerContract.isPoolAdmin(poolAdmin);
  const isEmergencyAdmin =
    await aclManagerContract.isEmergencyAdmin(emergencyAdmin);

  if (!isACLAdmin) {
    throw "[ACL][ERROR] ACLAdmin is not setup correctly";
  }

  if (!isPoolAdmin) {
    throw "[ACL][ERROR] PoolAdmin is not setup correctly";
  }

  if (!isEmergencyAdmin) {
    throw "[ACL][ERROR] EmergencyAdmin is not setup correctly";
  }
  console.log("== Market Admins ==");
  console.log("- ACL Admin", aclAdmin.address);
  console.log("- Pool Admin", poolAdmin.address);
  console.log("- Emergency Admin", emergencyAdmin.address);
  console.log("===================");

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
