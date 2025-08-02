import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FeeAmount } from "@uniswap/v3-sdk";
import hre, { getNamedAccounts } from "hardhat";
import { Deployment } from "hardhat-deploy/types";

import {
  AaveProtocolDataProvider,
  AmoManager,
  AToken,
  CollateralVault,
  Issuer,
  MintableERC20,
  Pool,
  PoolAddressesProvider,
  Redeemer,
  StaticOracleWrapper,
} from "../../typechain-types";
import {
  AMO_MANAGER_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
  ISSUER_CONTRACT_ID,
  REDEEMER_CONTRACT_ID,
} from "../../utils/deploy-ids";
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
  dusd: MintableERC20; // TODO: should replace with dUSD
  fxs: MintableERC20;
  sfrax: MintableERC20;
  aDUSD: AToken;
  aFXS: AToken;
  aSFRAX: AToken;
  swapPoolFee: FeeAmount;
  helpersContract: AaveProtocolDataProvider;
  users: HardhatEthersSigner[];
  swapRouter: Deployment;
  dusdRedeemer: Redeemer;
  dusdCollateralVault: CollateralVault;
  dusdIssuer: Issuer;
  dusdAmoManager: AmoManager;
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
    dusdDeployer,
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
    "dUSD",
  );

  const { contract: sfrax } = await getTokenContractForSymbol(
    dexDeployer,
    "SFRAX",
  );

  const aDUSD = await getATokenForSymbol(lendingDeployer, "dUSD");
  const { contract: fxs } = await getTokenContractForSymbol(dexDeployer, "FXS");
  const aFXS = await getATokenForSymbol(lendingDeployer, "FXS");
  const aSFRAX = await getATokenForSymbol(lendingDeployer, "SFRAX");
  const dataProvider = await hre.deployments.get(POOL_DATA_PROVIDER_ID);
  const helpersContract = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    dataProvider.address,
  );
  const swapRouter = await hre.deployments.get(SWAP_ROUTER_ID);
  const dusdRedeemerDeployment =
    await hre.deployments.get(REDEEMER_CONTRACT_ID);
  const dusdRedeemer = await hre.ethers.getContractAt(
    "Redeemer",
    dusdRedeemerDeployment.address,
    await hre.ethers.getSigner(dusdDeployer),
  );
  const dusdCollateralVaultDeployment = await hre.deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID,
  );
  const dusdCollateralVault = await hre.ethers.getContractAt(
    "CollateralHolderVault",
    dusdCollateralVaultDeployment.address,
    await hre.ethers.getSigner(dusdDeployer),
  );
  const dusdIssuerDeployment = await hre.deployments.get(ISSUER_CONTRACT_ID);
  const dusdIssuer = await hre.ethers.getContractAt(
    "Issuer",
    dusdIssuerDeployment.address,
    await hre.ethers.getSigner(dusdDeployer),
  );
  const dusdAmoManagerDeployment = await hre.deployments.get(AMO_MANAGER_ID);
  const dusdAmoManager = await hre.ethers.getContractAt(
    "AmoManager",
    dusdAmoManagerDeployment.address,
    await hre.ethers.getSigner(dusdDeployer),
  );

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
    dusdRedeemer,
    dusdCollateralVault,
    dusdIssuer,
    dusdAmoManager,
  };
}
