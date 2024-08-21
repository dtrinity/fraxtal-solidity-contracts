import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish, ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { isValidAddress } from "../address";
import {
  ATOKEN_IMPL_ID,
  DELEGATION_AWARE_ATOKEN_IMPL_ID,
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_CONFIGURATOR_PROXY_ID,
  POOL_DATA_PROVIDER_ID,
  RESERVES_SETUP_HELPER_ID,
  STABLE_DEBT_TOKEN_IMPL_ID,
  VARIABLE_DEBT_TOKEN_IMPL_ID,
} from "./deploy-ids";
import { eContractid, iMultiPoolsAssets, IReserveParams } from "./types";
import { chunk } from "./utils";

/**
 * Add a new market to the LendingPoolAddressesProviderRegistry
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/helpers/init-helpers.ts#L415-L446
 *
 * @param hre - Hardhat Runtime Environment
 * @param providerId - The ID of the provider
 * @param addressesProviderAddress - The address of the LendingPoolAddressesProvider contract
 */
export async function addMarketToRegistry(
  hre: HardhatRuntimeEnvironment,
  providerId: number,
  addressesProviderAddress: string,
): Promise<void> {
  const PoolAddressesProviderRegistryContractName =
    "PoolAddressesProviderRegistry";

  // Get the deployed PoolAddressesProviderRegistry instance from the deployments cache
  const providerRegistry = await hre.deployments.get(
    PoolAddressesProviderRegistryContractName,
  );
  let providerRegistryContract = await hre.ethers.getContractAt(
    PoolAddressesProviderRegistryContractName,
    providerRegistry.address,
  );

  const providerRegistryOwner = await providerRegistryContract.owner();

  if (!isValidAddress(addressesProviderAddress)) {
    throw Error(
      `[add-market-to-registry] Input parameter "addressesProvider" is missing or is not an address: ${addressesProviderAddress}`,
    );
  }

  // The corresponding private key will be found in the hardhat.config.ts file
  // If there is not a private key for the given providerRegistryOwner address, it will throw an error
  const signer = await hre.ethers.getSigner(providerRegistryOwner);

  console.log(`------------------------`);
  console.log(`Checking if the providerId was already added`);
  const providerAddress =
    await providerRegistryContract.getAddressesProviderAddressById(providerId);

  if (providerAddress !== ZeroAddress) {
    console.log(
      `Provider with ID ${providerId} already exists at ${providerAddress}`,
    );
    return;
  }

  console.log(`------------------------`);
  console.log(
    `Calling registerAddressesProvider(${addressesProviderAddress}, ${providerId}) with signer ${signer.address}`,
  );
  // 1. Set the provider at the Registry
  // Get the contract instance again to avoid type-check issue
  providerRegistryContract = await hre.ethers.getContractAt(
    PoolAddressesProviderRegistryContractName,
    providerRegistry.address,
    signer,
  );
  const registerAddressesProviderResponse =
    await providerRegistryContract.registerAddressesProvider(
      addressesProviderAddress,
      providerId,
    );
  const registerAddressesProviderReceipt =
    await registerAddressesProviderResponse.wait();
  console.log(`  - TxHash: ${registerAddressesProviderReceipt?.hash}`);
  console.log(`  - From: ${registerAddressesProviderReceipt?.from}`);
  console.log(
    `  - GasUsed: ${registerAddressesProviderReceipt?.gasUsed.toString()}`,
  );
  console.log(
    `\n`,
    `Added LendingPoolAddressesProvider with address "${addressesProviderAddress}" to registry located at ${providerRegistry.address}`,
  );
  console.log(`------------------------`);
}

/**
 * Initialize the reserves by the helper contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param reservesParams - The reserves parameters
 * @param tokenAddresses - The token addresses
 * @param admin - The admin signer
 * @param treasuryAddress - The treasury address
 */
export async function initReservesByHelper(
  hre: HardhatRuntimeEnvironment,
  reservesParams: iMultiPoolsAssets<IReserveParams>,
  tokenAddresses: { [symbol: string]: string },
  admin: HardhatEthersSigner,
  treasuryAddress: string,
): Promise<void> {
  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProviderContract = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderDeployedResult.address,
    admin,
  );

  const poolContract = await hre.ethers.getContractAt(
    "Pool",
    await addressProviderContract.getPool(),
    // admin,
  );

  // CHUNK CONFIGURATION
  const initChunks = 3;

  // Initialize variables for future reserves initialization
  const reserveTokens: string[] = [];
  const reserveInitDecimals: string[] = [];
  const reserveSymbols: string[] = [];

  const initInputParams: {
    aTokenImpl: string;
    stableDebtTokenImpl: string;
    variableDebtTokenImpl: string;
    underlyingAssetDecimals: BigNumberish;
    interestRateStrategyAddress: string;
    underlyingAsset: string;
    treasury: string;
    incentivesController: string;
    underlyingAssetName: string;
    aTokenName: string;
    aTokenSymbol: string;
    variableDebtTokenName: string;
    variableDebtTokenSymbol: string;
    stableDebtTokenName: string;
    stableDebtTokenSymbol: string;
    params: string;
  }[] = [];

  const strategyAddresses: Record<string, string> = {};
  const strategyAddressPerAsset: Record<string, string> = {};
  const aTokenType: Record<string, string> = {};
  let delegationAwareATokenImplementationAddress = "";

  const stableDebtTokenImplementationAddress = (
    await hre.deployments.get(STABLE_DEBT_TOKEN_IMPL_ID)
  ).address;
  const variableDebtTokenImplementationAddress = (
    await hre.deployments.get(VARIABLE_DEBT_TOKEN_IMPL_ID)
  ).address;

  const aTokenImplementationAddress = (
    await hre.deployments.get(ATOKEN_IMPL_ID)
  ).address;

  const delegatedAwareReserves = Object.entries(reservesParams).filter(
    ([_, { aTokenImpl }]) => aTokenImpl === eContractid.DelegationAwareAToken,
  ) as [string, IReserveParams][];

  if (delegatedAwareReserves.length > 0) {
    delegationAwareATokenImplementationAddress = (
      await hre.deployments.get(DELEGATION_AWARE_ATOKEN_IMPL_ID)
    ).address;
  }

  const reserves = Object.entries(reservesParams).filter(
    ([_, { aTokenImpl }]) =>
      aTokenImpl === eContractid.DelegationAwareAToken ||
      aTokenImpl === eContractid.AToken,
  ) as [string, IReserveParams][];

  for (let [symbol, params] of reserves) {
    if (!tokenAddresses[symbol]) {
      console.log(
        `- Skipping init of ${symbol} due token address is not set at markets config`,
      );
      continue;
    }

    const poolReserve = await poolContract.getReserveData(
      tokenAddresses[symbol],
    );

    if (poolReserve.aTokenAddress !== ZeroAddress) {
      console.log(`- Skipping init of ${symbol} due is already initialized`);
      continue;
    }

    const { strategy, aTokenImpl, reserveDecimals } = params;

    if (!strategyAddresses[strategy.name]) {
      // Strategy does not exist, load it
      strategyAddresses[strategy.name] = (
        await hre.deployments.get(`ReserveStrategy-${strategy.name}`)
      ).address;
    }
    strategyAddressPerAsset[symbol] = strategyAddresses[strategy.name];
    console.log(
      "Strategy address for asset %s: %s",
      symbol,
      strategyAddressPerAsset[symbol],
    );

    if (aTokenImpl === eContractid.AToken) {
      aTokenType[symbol] = "generic";
    } else if (aTokenImpl === eContractid.DelegationAwareAToken) {
      aTokenType[symbol] = "delegation aware";
    }

    reserveInitDecimals.push(reserveDecimals);
    reserveTokens.push(tokenAddresses[symbol]);
    reserveSymbols.push(symbol);
  }

  for (let i = 0; i < reserveSymbols.length; i++) {
    let aTokenToUse: string;

    if (aTokenType[reserveSymbols[i]] === "generic") {
      aTokenToUse = aTokenImplementationAddress;
    } else {
      aTokenToUse = delegationAwareATokenImplementationAddress;
    }

    initInputParams.push({
      aTokenImpl: aTokenToUse,
      stableDebtTokenImpl: stableDebtTokenImplementationAddress,
      variableDebtTokenImpl: variableDebtTokenImplementationAddress,
      underlyingAssetDecimals: reserveInitDecimals[i],
      interestRateStrategyAddress: strategyAddressPerAsset[reserveSymbols[i]],
      underlyingAsset: reserveTokens[i],
      treasury: treasuryAddress,
      incentivesController: ZeroAddress, // We do not use the AAVE native incentives controller
      underlyingAssetName: reserveSymbols[i],
      aTokenName: `dTRINITY Lend ${reserveSymbols[i]}`, // e.g. dTRINITY Lend dUSD
      aTokenSymbol: `d${reserveSymbols[i]}`, // e.g. ddUSD
      variableDebtTokenName: `dTRINITY Variable Debt ${reserveSymbols[i]}`, // e.g. dTRINITY Variable Debt dUSD
      variableDebtTokenSymbol: `variableDebt${reserveSymbols[i]}`, // e.g. variableDebtdUSD
      stableDebtTokenName: `dTRINITY Stable Debt ${reserveSymbols[i]}`, // Not in use
      stableDebtTokenSymbol: `stableDebt${reserveSymbols[i]}`, // Not in use
      params: "0x10",
    });
  }

  // Deploy init reserves per chunks
  const chunkedSymbols = chunk(reserveSymbols, initChunks);
  const chunkedInitInputParams = chunk(initInputParams, initChunks);

  const proxyDeployedResult = await hre.deployments.get(
    POOL_CONFIGURATOR_PROXY_ID,
  );
  const configuratorContract = await hre.ethers.getContractAt(
    "PoolConfigurator",
    proxyDeployedResult.address,
    admin,
  );

  console.log(
    `- Reserves initialization in ${chunkedInitInputParams.length} txs`,
  );

  for (
    let chunkIndex = 0;
    chunkIndex < chunkedInitInputParams.length;
    chunkIndex++
  ) {
    console.log(`------------------------`);
    console.log(`Init reserves chunk ${chunkIndex + 1}`);
    console.log(`  - Configurator: ${await configuratorContract.getAddress()}`);
    console.log(`  - Reserves    : ${chunkedSymbols[chunkIndex].join(", ")}`);
    const tx = await configuratorContract.initReserves(
      chunkedInitInputParams[chunkIndex],
    );
    const receipt = await tx.wait();
    console.log(`  - Tx hash     : ${receipt?.hash}`);
    console.log(`  - From        : ${receipt?.from}`);
    console.log(`  - Gas used    : ${receipt?.gasUsed.toString()}`);
    console.log(`------------------------`);
  }
}

/**
 * Configure the reserves by the helper contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param reservesParams - The reserves parameters
 * @param tokenAddresses - The token addresses
 */
export async function configureReservesByHelper(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  reservesParams: iMultiPoolsAssets<IReserveParams>,
  tokenAddresses: { [symbol: string]: string },
): Promise<void> {
  const addressProviderArtifact = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );
  const addressProvider = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    addressProviderArtifact.address,
    // deployer
  );

  const reservesSetupArtifact = await hre.deployments.get(
    RESERVES_SETUP_HELPER_ID,
  );
  const reservesSetupHelper = await hre.ethers.getContractAt(
    "ReservesSetupHelper",
    reservesSetupArtifact.address,
    deployer,
  );

  const protocolDataProvider = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    (await hre.deployments.get(POOL_DATA_PROVIDER_ID)).address,
    // deployer
  );

  const tokens: string[] = [];
  const symbols: string[] = [];

  const inputParams: {
    asset: string;
    baseLTV: BigNumberish;
    liquidationThreshold: BigNumberish;
    liquidationBonus: BigNumberish;
    reserveFactor: BigNumberish;
    borrowCap: BigNumberish;
    supplyCap: BigNumberish;
    stableBorrowingEnabled: boolean;
    borrowingEnabled: boolean;
    flashLoanEnabled: boolean;
  }[] = [];

  for (const [
    assetSymbol,
    {
      baseLTVAsCollateral,
      liquidationBonus,
      liquidationThreshold,
      reserveFactor,
      borrowCap,
      supplyCap,
      stableBorrowRateEnabled,
      borrowingEnabled,
      flashLoanEnabled,
    },
  ] of Object.entries(reservesParams) as [string, IReserveParams][]) {
    if (!tokenAddresses[assetSymbol]) {
      console.log(
        `- Skipping init of ${assetSymbol} due token address is not set at markets config`,
      );
      continue;
    }

    if (baseLTVAsCollateral === "-1") {
      continue;
    }

    const assetAddressIndex = Object.keys(tokenAddresses).findIndex(
      (value) => value === assetSymbol,
    );
    const [, tokenAddress] = (
      Object.entries(tokenAddresses) as [string, string][]
    )[assetAddressIndex];
    const { usageAsCollateralEnabled: alreadyEnabled } =
      await protocolDataProvider.getReserveConfigurationData(tokenAddress);

    if (alreadyEnabled) {
      console.log(
        `- Reserve ${assetSymbol} is already enabled as collateral, skipping`,
      );
      continue;
    }

    // Push data
    inputParams.push({
      asset: tokenAddress,
      baseLTV: baseLTVAsCollateral,
      liquidationThreshold,
      liquidationBonus,
      reserveFactor,
      borrowCap,
      supplyCap,
      stableBorrowingEnabled: stableBorrowRateEnabled,
      borrowingEnabled: borrowingEnabled,
      flashLoanEnabled: flashLoanEnabled,
    });

    tokens.push(tokenAddress);
    symbols.push(assetSymbol);
  }

  if (tokens.length) {
    // Set aTokenAndRatesDeployer as temporal admin
    const aclAdminAddress = await addressProvider.getACLAdmin();
    const aclAdmin = await hre.ethers.getSigner(aclAdminAddress);

    console.log(`------------------------`);
    console.log(`Add Risk Admin`);
    console.log(`  - Risk Admin: ${aclAdminAddress}`);
    let aclManager = await hre.ethers.getContractAt(
      "ACLManager",
      await addressProvider.getACLManager(),
      // deployer
    );
    const tx = await aclManager.addRiskAdmin(
      await reservesSetupHelper.getAddress(),
    );
    const receipt = await tx.wait();
    console.log(`  - TxHash : ${receipt?.hash}`);
    console.log(`  - From   : ${receipt?.from}`);
    console.log(`  - GasUsed: ${receipt?.gasUsed.toString()}`);
    console.log(`------------------------`);

    // Deploy init per chunks
    const enableChunks = 20;
    const chunkedSymbols = chunk(symbols, enableChunks);
    const chunkedInputParams = chunk(inputParams, enableChunks);
    const poolConfiguratorAddress = await addressProvider.getPoolConfigurator();

    console.log(`- Configure reserves in ${chunkedInputParams.length} txs`);

    for (
      let chunkIndex = 0;
      chunkIndex < chunkedInputParams.length;
      chunkIndex++
    ) {
      console.log(`------------------------`);
      console.log(`Configure reserves chunk ${chunkIndex + 1}`);
      console.log(`  - Configurator: ${poolConfiguratorAddress}`);
      console.log(`  - Reserves    : ${chunkedSymbols[chunkIndex].join(", ")}`);
      const tx = await reservesSetupHelper.configureReserves(
        poolConfiguratorAddress,
        chunkedInputParams[chunkIndex],
      );
      const receipt = await tx.wait();
      console.log(`  - Tx hash: ${receipt?.hash}`);
      console.log(`  - From: ${receipt?.from}`);
      console.log(`  - Gas used: ${receipt?.gasUsed.toString()}`);
    }
    console.log(`------------------------`);

    // Remove ReservesSetupHelper from risk admins
    const reserveHelperAddress = await reservesSetupHelper.getAddress();
    console.log(`------------------------`);
    console.log(`Remove ReservesSetupHelper from risk admins`);
    console.log(`  - Risk Admin          : ${await aclAdmin.getAddress()}`);
    console.log(`  - ReservesSetupHelper : ${reserveHelperAddress}`);
    console.log(`  - ACL Manager         : ${await aclManager.getAddress()}`);
    aclManager = await hre.ethers.getContractAt(
      "ACLManager",
      await addressProvider.getACLManager(),
      deployer,
    );
    const removeRiskAdminResponse =
      await aclManager.removeRiskAdmin(reserveHelperAddress);
    const removeRiskAdminReceipt = await removeRiskAdminResponse.wait();
    console.log(`  - TxHash : ${removeRiskAdminReceipt?.hash}`);
    console.log(`  - From   : ${removeRiskAdminReceipt?.from}`);
    console.log(`  - GasUsed: ${removeRiskAdminReceipt?.gasUsed.toString()}`);
    console.log(`------------------------`);
  }
}
