// USD Oracles
export const USD_ORACLE_AGGREGATOR_ID = "USD_OracleAggregator";
export const USD_API3_ORACLE_WRAPPER_ID = "USD_API3Wrapper";
export const USD_API3_WRAPPER_WITH_THRESHOLDING_ID = "USD_API3WrapperWithThresholding";
export const USD_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID = "USD_API3CompositeWrapperWithThresholding";
export const USD_REDSTONE_ORACLE_WRAPPER_ID = "USD_RedstoneChainlinkWrapper";
export const USD_REDSTONE_WRAPPER_WITH_THRESHOLDING_ID = "USD_RedstoneChainlinkWrapperWithThresholding";
export const USD_REDSTONE_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID = "USD_RedstoneChainlinkCompositeWrapperWithThresholding";

// dUSD
export const dUSD_TOKEN_ID = "dUSD";
export const dUSD_ISSUER_CONTRACT_ID = "dUSD_Issuer";
export const dUSD_REDEEMER_CONTRACT_ID = "dUSD_Redeemer";
export const dUSD_COLLATERAL_VAULT_CONTRACT_ID = "dUSD_CollateralHolderVault";
export const dUSD_AMO_MANAGER_ID = "dUSD_AmoManager";
export const dUSD_HARD_PEG_ORACLE_WRAPPER_ID = "dUSD_HardPegOracleWrapper";

// dLEND
export const TREASURY_PROXY_ID = "TreasuryProxy";
export const TREASURY_CONTROLLER_ID = "TreasuryController";
export const TREASURY_IMPL_ID = "TreasuryImpl";
export const POOL_ADDRESSES_PROVIDER_ID = "PoolAddressesProvider";
export const POOL_DATA_PROVIDER_ID = "PoolDataProvider-dTrinity-Lend";
export const POOL_IMPL_ID = "PoolImpl";
export const POOL_CONFIGURATOR_ID = "PoolConfigurator";
export const ACL_MANAGER_ID = "ACLManager";
export const PRICE_ORACLE_ID = "PriceOracle";
export const PRICE_ORACLE_SENTINEL_ID = "PriceOracleSentinel";
export const ATOKEN_IMPL_ID = "ATokenImpl";
export const VARIABLE_DEBT_TOKEN_IMPL_ID = "VariableDebtTokenImpl";
export const STABLE_DEBT_TOKEN_IMPL_ID = "StableDebtTokenImpl";
export const RATE_STRATEGY_ID = "RateStrategy";
export const POOL_PROXY_ID = "PoolProxy";
export const POOL_CONFIGURATOR_PROXY_ID = "PoolConfiguratorProxy";
export const POOL_ADDRESS_PROVIDER_REGISTRY_ID = "PoolAddressesProviderRegistry";
export const SUPPLY_LOGIC_ID = "SupplyLogic";
export const BORROW_LOGIC_ID = "BorrowLogic";
export const LIQUIDATION_LOGIC_ID = "LiquidationLogic";
export const EMODE_LOGIC_ID = "EModeLogic";
export const BRIDGE_LOGIC_ID = "BridgeLogic";
export const CONFIGURATOR_LOGIC_ID = "ConfiguratorLogic";
export const FLASH_LOAN_LOGIC_ID = "FlashLoanLogic";
export const POOL_LOGIC_ID = "PoolLogic";
export const CALLDATA_LOGIC_ID = "CalldataLogic";
export const RESERVES_SETUP_HELPER_ID = "ReservesSetupHelper";
export const WALLET_BALANCE_PROVIDER_ID = "WalletBalanceProvider";
export const UI_INCENTIVE_DATA_PROVIDER_ID = "UiIncentiveDataProviderV3";
export const UI_POOL_DATA_PROVIDER_ID = "UiPoolDataProviderV3";
export const EMISSION_MANAGER_ID = "EmissionManager";
export const INCENTIVES_IMPL_ID = "RewardsController";
export const INCENTIVES_PROXY_ID = "IncentivesProxy";
export const PULL_REWARDS_TRANSFER_STRATEGY_ID = "PullRewardsTransferStrategy";
export const ORACLE_AGGREGATOR_WRAPPER_BASE_ID = "oracle-aggregator-wrapper-base";

// dLOOP
export const DLOOP_CORE_DLEND_ID = "DLoopCoreDLend";

/* dLOOP Periphery */
export const DLOOP_PERIPHERY_ODOS_DEPOSITOR_ID = "DLoopDepositorOdos";
export const DLOOP_PERIPHERY_ODOS_REDEEMER_ID = "DLoopRedeemerOdos";
export const DLOOP_PERIPHERY_ODOS_DECREASE_LEVERAGE_ID = "DLoopDecreaseLeverageOdos";
export const DLOOP_PERIPHERY_ODOS_INCREASE_LEVERAGE_ID = "DLoopIncreaseLeverageOdos";
export const DLOOP_PERIPHERY_ODOS_SWAP_LOGIC_ID = "OdosSwapLogic";

// Wrapped dLEND ATokens
export const DLEND_STATIC_A_TOKEN_FACTORY_ID = "dLend_StaticATokenFactory";
export const DLEND_A_TOKEN_WRAPPER_PREFIX = "dLend_ATokenWrapper";
export const dUSD_A_TOKEN_WRAPPER_ID = `${DLEND_A_TOKEN_WRAPPER_PREFIX}_dUSD`;
// DS_A_TOKEN_WRAPPER_ID removed for Fraxtal (dS token not supported)

// dSTAKE deployment tag
export const DSTAKE_DEPLOYMENT_TAG = "dStake"; // Define the deployment tag

// dSTAKE deploy ID prefixes
export const DSTAKE_TOKEN_ID_PREFIX = "DStakeToken";
export const DSTAKE_COLLATERAL_VAULT_ID_PREFIX = "DStakeCollateralVault";
export const DSTAKE_ROUTER_ID_PREFIX = "DStakeRouter";

// dSTAKE specific instance IDs
export const SDUSD_DSTAKE_TOKEN_ID = `${DSTAKE_TOKEN_ID_PREFIX}_sdUSD`;
export const SDUSD_COLLATERAL_VAULT_ID = `${DSTAKE_COLLATERAL_VAULT_ID_PREFIX}_sdUSD`;
export const SDUSD_ROUTER_ID = `${DSTAKE_ROUTER_ID_PREFIX}_sdUSD`;

// SDS (staked dS) constants removed for Fraxtal (dS token not supported)

// dSTAKE adapter IDs
export const WRAPPED_DLEND_CONVERSION_ADAPTER_ID_PREFIX = "WrappedDLendConversionAdapter";
export const SDUSD_WRAPPED_DLEND_CONVERSION_ADAPTER_ID = `${WRAPPED_DLEND_CONVERSION_ADAPTER_ID_PREFIX}_sdUSD`;

// dSTAKE reward manager IDs
export const DSTAKE_REWARD_MANAGER_DLEND_ID_PREFIX = "DStakeRewardManagerDLend";
export const SDUSD_REWARD_MANAGER_ID = `${DSTAKE_REWARD_MANAGER_DLEND_ID_PREFIX}_sdUSD`;
// SDS_REWARD_MANAGER_ID removed for Fraxtal (dS token not supported)

// RedeemerWithFees
export const dUSD_REDEEMER_WITH_FEES_CONTRACT_ID = "dUSD_RedeemerWithFees";

// Vesting NFT
export const ERC20_VESTING_NFT_ID = "ERC20VestingNFT";
export const DSTAKE_NFT_VESTING_DEPLOYMENT_TAG = "dstake_nft_vesting";
