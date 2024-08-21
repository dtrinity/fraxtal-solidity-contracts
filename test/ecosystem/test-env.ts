import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FeeAmount } from "@uniswap/v3-sdk";
import hre, { getNamedAccounts } from "hardhat";
import { Deployment } from "hardhat-deploy/types";

import {
  AaveProtocolDataProvider,
  AToken,
  MintableERC20,
  Pool,
  PoolAddressesProvider,
  StaticOracleWrapper,
} from "../../typechain-types";
import {
  SWAP_ROUTER_ID,
  UNISWAP_STATIC_ORACLE_WRAPPER_ID,
} from "../../utils/dex/deploy-ids";
import {
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_DATA_PROVIDER_ID,
} from "../../utils/lending/deploy-ids";
import { getATokenForSymbol, getTokenContractForSymbol } from "./utils.token";

export interface TestEnv {
  lendingDeployer: string;
  dexDeployer: string;
  pool: Pool;
  addressesProvider: PoolAddressesProvider;
  oracle: StaticOracleWrapper;
  dusd: MintableERC20;
  fxs: MintableERC20;
  sfrax: MintableERC20;
  aDUSD: AToken;
  aFXS: AToken;
  aSFRAX: AToken;
  swapPoolFee: FeeAmount;
  helpersContract: AaveProtocolDataProvider;
  users: HardhatEthersSigner[];
  swapRouter: Deployment;
}

/**
 * Load the test environment
 *
 * @returns TestEnv
 */
export async function loadTestEnv(): Promise<TestEnv> {
  const {
    dexDeployer,
    lendingDeployer,
    testAccount1,
    testAccount2,
    testAccount3,
  } = await getNamedAccounts();
  const users = [
    await hre.ethers.getSigner(testAccount1),
    await hre.ethers.getSigner(testAccount2),
    await hre.ethers.getSigner(testAccount3),
  ];
  const dexSigner = await hre.ethers.getSigner(dexDeployer);
  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressesProvider = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    dexSigner,
  );
  const poolAddress = await addressesProvider.getPool();
  const pool = await hre.ethers.getContractAt("Pool", poolAddress, dexSigner);

  const { address: aaveOracleAddress } = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );

  const oracle = await hre.ethers.getContractAt(
    "StaticOracleWrapper",
    aaveOracleAddress,
    await hre.ethers.getSigner(lendingDeployer),
  );

  const { contract: dusd } = await getTokenContractForSymbol(
    dexDeployer,
    "DUSD",
  );

  const { contract: sfrax } = await getTokenContractForSymbol(
    dexDeployer,
    "SFRAX",
  );

  const aDUSD = await getATokenForSymbol(lendingDeployer, "DUSD");
  const { contract: fxs } = await getTokenContractForSymbol(dexDeployer, "FXS");
  const aFXS = await getATokenForSymbol(lendingDeployer, "FXS");
  const aSFRAX = await getATokenForSymbol(lendingDeployer, "SFRAX");
  const dataProvider = await hre.deployments.get(POOL_DATA_PROVIDER_ID);
  const helpersContract = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    dataProvider.address,
  );
  const swapRouter = await hre.deployments.get(SWAP_ROUTER_ID);

  return {
    lendingDeployer,
    dexDeployer,
    pool,
    addressesProvider,
    oracle,
    dusd,
    fxs,
    sfrax,
    aDUSD,
    aFXS,
    aSFRAX,
    swapPoolFee: FeeAmount.HIGH,
    helpersContract,
    users,
    swapRouter,
  };
}
