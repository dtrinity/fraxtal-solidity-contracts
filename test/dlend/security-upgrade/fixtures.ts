import hre, { deployments, ethers } from "hardhat";

import {
  ATOKEN_IMPL_ID,
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_DATA_PROVIDER_ID,
  STABLE_DEBT_TOKEN_IMPL_ID,
  TREASURY_PROXY_ID,
  VARIABLE_DEBT_TOKEN_IMPL_ID,
} from "../../../utils/lending/deploy-ids";
import { ATOMIC_MARKET_LISTING_HELPER_ID } from "../../../utils/lending/security-upgrade-ids";

export type DecodedReserveConfig = {
  ltv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  reserveFactor: bigint;
  active: boolean;
  frozen: boolean;
  borrowingEnabled: boolean;
  stableBorrowingEnabled: boolean;
  paused: boolean;
  borrowableInIsolation: boolean;
  flashLoanEnabled: boolean;
  borrowCap: bigint;
  supplyCap: bigint;
  liquidationProtocolFee: bigint;
  unbackedMintCap: bigint;
  debtCeiling: bigint;
};

/**
 * Extracts a bitfield from a bigint.
 *
 * @param value The value to extract from
 * @param start The starting bit
 * @param width The width of the bitfield
 * @returns The extracted bitfield
 */
function bit(value: bigint, start: bigint, width = 1n): bigint {
  return (value >> start) & ((1n << width) - 1n);
}

/**
 * Decodes the reserve configuration data.
 *
 * @param data The raw data
 * @returns The decoded reserve configuration
 */
export function decodeReserveConfig(data: bigint): DecodedReserveConfig {
  return {
    ltv: bit(data, 0n, 16n),
    liquidationThreshold: bit(data, 16n, 16n),
    liquidationBonus: bit(data, 32n, 16n),
    active: bit(data, 56n) === 1n,
    frozen: bit(data, 57n) === 1n,
    borrowingEnabled: bit(data, 58n) === 1n,
    stableBorrowingEnabled: bit(data, 59n) === 1n,
    paused: bit(data, 60n) === 1n,
    borrowableInIsolation: bit(data, 61n) === 1n,
    flashLoanEnabled: bit(data, 63n) === 1n,
    reserveFactor: bit(data, 64n, 16n),
    borrowCap: bit(data, 80n, 36n),
    supplyCap: bit(data, 116n, 36n),
    liquidationProtocolFee: bit(data, 152n, 16n),
    unbackedMintCap: bit(data, 176n, 36n),
    debtCeiling: bit(data, 212n, 40n),
  };
}

/**
 * Reads the reserve configuration from the pool.
 *
 * @param pool The pool contract
 * @param asset The asset address
 * @returns The decoded reserve configuration
 */
export async function readConfig(pool: any, asset: string): Promise<DecodedReserveConfig> {
  const raw = await pool.getConfiguration(asset);
  return decodeReserveConfig(BigInt(raw.data.toString()));
}

/**
 * Builds the security upgrade fixture.
 *
 * @returns The fixture data
 */
async function buildSecurityUpgradeFixture(): Promise<any> {
  await deployments.fixture();
  await deployments.fixture(["mock", "lbp", "lbp-security-upgrade"]);

  const { lendingDeployer, testTokenOwner1 } = await hre.getNamedAccounts();
  const deployer = await ethers.getSigner(lendingDeployer);
  const user1 = await ethers.getSigner(testTokenOwner1);

  const providerDeployment = await deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const poolAddressesProvider = await ethers.getContractAt("PoolAddressesProvider", providerDeployment.address, deployer);
  const pool = await ethers.getContractAt("Pool", await poolAddressesProvider.getPool(), deployer);
  const poolConfigurator = await ethers.getContractAt("PoolConfigurator", await poolAddressesProvider.getPoolConfigurator(), deployer);
  const dataProvider = await ethers.getContractAt(
    "AaveProtocolDataProvider",
    (await deployments.get(POOL_DATA_PROVIDER_ID)).address,
    deployer,
  );
  const helper = await ethers.getContractAt(
    "AtomicMarketListingHelper",
    (await deployments.get(ATOMIC_MARKET_LISTING_HELPER_ID)).address,
    deployer,
  );
  const aclManager = await ethers.getContractAt("ACLManager", await poolAddressesProvider.getACLManager(), deployer);

  if (!(await aclManager.isAssetListingAdmin(await helper.getAddress()))) {
    await (await aclManager.addAssetListingAdmin(await helper.getAddress())).wait();
  }

  if (!(await aclManager.isRiskAdmin(await helper.getAddress()))) {
    await (await aclManager.addRiskAdmin(await helper.getAddress())).wait();
  }

  const reservesList = await pool.getReservesList();

  return {
    deployer,
    user1,
    poolAddressesProvider,
    pool,
    poolConfigurator,
    dataProvider,
    helper,
    aclManager,
    reservesList,
    aTokenImplAddress: (await deployments.get(ATOKEN_IMPL_ID)).address,
    stableDebtTokenImplAddress: (await deployments.get(STABLE_DEBT_TOKEN_IMPL_ID)).address,
    variableDebtTokenImplAddress: (await deployments.get(VARIABLE_DEBT_TOKEN_IMPL_ID)).address,
    treasuryAddress: (await deployments.get(TREASURY_PROXY_ID)).address,
  };
}

export const securityUpgradeFixture = deployments.createFixture(buildSecurityUpgradeFixture);
