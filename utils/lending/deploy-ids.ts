import { MARKET_NAME } from "./constants";

/**
 * The actual contract name is `InitializableAdminUpgradeabilityProxy`
 */
export const TREASURY_PROXY_ID = "TreasuryProxy";

/**
 * The actual contract name is `AaveEcosystemReserveController`
 */
export const TREASURY_CONTROLLER_ID = "TreasuryController";

/**
 * The actual contract name is `AaveEcosystemReserveV2`
 */
export const TREASURY_IMPL_ID = "TreasuryImpl";

/**
 * The actual contract name is `PoolAddressesProvider`
 */
export const POOL_ADDRESSES_PROVIDER_ID = `PoolAddressesProvider-${MARKET_NAME}`;

/**
 * The actual contract name is `AaveProtocolDataProvider`
 */
export const POOL_DATA_PROVIDER_ID = `PoolDataProvider-${MARKET_NAME}`;

export const IMPL_ID = `Implementation`;

/**
 * The actual contract name is `Pool`
 */
export const POOL_IMPL_ID = `Pool-${IMPL_ID}`;

/**
 * The actual contract name is `L2Pool`
 */
export const L2_POOL_IMPL_ID = `L2Pool-${IMPL_ID}`;

/**
 * The actual contract name is `PoolConfigurator`
 */
export const POOL_CONFIGURATOR_IMPL_ID = `PoolConfigurator-${IMPL_ID}`;

/**
 * The actual contract name is `ReservesSetupHelper`
 */
export const RESERVES_SETUP_HELPER_ID = "ReservesSetupHelper";

/**
 * The actual contract name is `ACLManager`
 */
export const ACL_MANAGER_ID = `ACLManager-${MARKET_NAME}`;

/**
 * The actual contract name is `AaveOracle`
 */
export const ORACLE_ID = `AaveOracle-${MARKET_NAME}`;

export const PROXY_ID = "Proxy";

/**
 * The actual contract name is `Pool`
 */
export const POOL_PROXY_ID = `Pool-${PROXY_ID}-${MARKET_NAME}`;

/**
 * The actual contract name is `PoolConfigurator`
 */
export const POOL_CONFIGURATOR_PROXY_ID = `PoolConfigurator-${PROXY_ID}-${MARKET_NAME}`;

/**
 * The actual contract name is `EmissionManager`
 */
export const EMISSION_MANAGER_ID = "EmissionManager";

export const INCENTIVES_PROXY_ID = "IncentivesProxy";

/**
 * The actual contract name is `RewardsController`
 */
export const INCENTIVES_V2_IMPL_ID = `IncentivesV2-${IMPL_ID}`;

/**
 * The actual contract name is `InitializableAdminUpgradeabilityProxy`
 */
export const STAKE_AAVE_PROXY = `StakeAave-${PROXY_ID}`;

/**
 * The actual contract name is `AToken`
 */
export const ATOKEN_IMPL_ID = `AToken-${MARKET_NAME}`;

/**
 * The actual contract name is `DelegationAwareAToken`
 */
export const DELEGATION_AWARE_ATOKEN_IMPL_ID = `DelegationAwareAToken-${MARKET_NAME}`;

/**
 * The actual contract name is `StableDebtToken`
 */
export const STABLE_DEBT_TOKEN_IMPL_ID = `StableDebtToken-${MARKET_NAME}`;

/**
 * The actual contract name is `VariableDebtToken`
 */
export const VARIABLE_DEBT_TOKEN_IMPL_ID = `VariableDebtToken-${MARKET_NAME}`;

export const ATOKEN_PREFIX = `-AToken-${MARKET_NAME}`;

export const VARIABLE_DEBT_PREFIX = `-VariableDebtToken-${MARKET_NAME}`;

export const STABLE_DEBT_PREFIX = `-StableDebtToken-${MARKET_NAME}`;
/**
 * The actual contract name is `PullRewardsTransferStrategy`
 */
export const INCENTIVES_PULL_REWARDS_STRATEGY_ID = `PullRewardsTransferStrategy`;
/**
 * The actual contract name is `StakedTokenTransferStrategy`
 */
export const INCENTIVES_STAKED_TOKEN_STRATEGY_ID = `StakedTokenTransferStrategy`;

export const DLEND_BALANCE_CHECKER_ID = "dLendBalanceChecker";

export const REWARDS_CONTROLLER_ID = "RewardsController";
