export type iMultiPoolsAssets<T> = iAssetCommon<T> | iAavePoolAssets<T>;

export interface iAssetCommon<T> {
  [key: string]: T;
}

export type iAavePoolAssets<T> = Pick<
  iAssetsWithoutUSD<T>,
  "DUSD" | "USDT" | "WETH"
>;

export type iAssetsWithoutUSD<T> = Omit<iAssetBase<T>, "USD">;

export interface iAssetBase<T> {
  WETH: T;
  DUSD: T;
  USDT: T;
  USD: T;
}

export interface IInterestRateStrategyParams {
  name: string;
  optimalUsageRatio: string;
  baseVariableBorrowRate: string;
  variableRateSlope1: string;
  variableRateSlope2: string;
  stableRateSlope1: string;
  stableRateSlope2: string;
  baseStableRateOffset: string;
  stableRateExcessOffset: string;
  optimalStableToTotalDebtRatio: string;
}

export interface IReserveBorrowParams {
  borrowingEnabled: boolean;
  stableBorrowRateEnabled: boolean;
  reserveDecimals: string;
  borrowCap: string;
  debtCeiling: string;
  borrowableIsolation: boolean;
  flashLoanEnabled: boolean;
}

export interface IReserveCollateralParams {
  baseLTVAsCollateral: string;
  liquidationThreshold: string;
  liquidationBonus: string;
  liquidationProtocolFee?: string;
}

export interface IReserveParams
  extends IReserveBorrowParams,
    IReserveCollateralParams {
  aTokenImpl: eContractid;
  reserveFactor: string;
  supplyCap: string;
  strategy: IInterestRateStrategyParams;
}

export interface IInterestRateStrategyParams {
  name: string;
  optimalUsageRatio: string;
  baseVariableBorrowRate: string;
  variableRateSlope1: string;
  variableRateSlope2: string;
  stableRateSlope1: string;
  stableRateSlope2: string;
  baseStableRateOffset: string;
  stableRateExcessOffset: string;
  optimalStableToTotalDebtRatio: string;
}

export enum eContractid {
  Example = "Example",
  PoolAddressesProvider = "PoolAddressesProvider",
  MintableERC20 = "MintableERC20",
  MintableDelegationERC20 = "MintableDelegationERC20",
  PoolAddressesProviderRegistry = "PoolAddressesProviderRegistry",
  PoolConfigurator = "PoolConfigurator",
  ValidationLogic = "ValidationLogic",
  ReserveLogic = "ReserveLogic",
  GenericLogic = "GenericLogic",
  Pool = "Pool",
  PriceOracle = "PriceOracle",
  Proxy = "Proxy",
  MockAggregator = "MockAggregator",
  AaveOracle = "AaveOracle",
  DefaultReserveInterestRateStrategy = "DefaultReserveInterestRateStrategy",
  LendingPoolCollateralManager = "LendingPoolCollateralManager",
  InitializableAdminUpgradeabilityProxy = "InitializableAdminUpgradeabilityProxy",
  MockFlashLoanReceiver = "MockFlashLoanReceiver",
  WalletBalanceProvider = "WalletBalanceProvider",
  AToken = "AToken",
  MockAToken = "MockAToken",
  DelegationAwareAToken = "DelegationAwareAToken",
  MockStableDebtToken = "MockStableDebtToken",
  MockVariableDebtToken = "MockVariableDebtToken",
  AaveProtocolDataProvider = "AaveProtocolDataProvider",
  IERC20Detailed = "IERC20Detailed",
  StableDebtToken = "StableDebtToken",
  VariableDebtToken = "VariableDebtToken",
  FeeProvider = "FeeProvider",
  TokenDistributor = "TokenDistributor",
  StableAndVariableTokensHelper = "StableAndVariableTokensHelper",
  ATokensAndRatesHelper = "ATokensAndRatesHelper",
  UiPoolDataProviderV3 = "UiPoolDataProviderV3",
  WrappedTokenGatewayV3 = "WrappedTokenGatewayV3",
  WETH = "WETH",
}
