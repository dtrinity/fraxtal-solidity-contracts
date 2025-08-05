# sdUSD Balance Checker Design

## Project Context
Creating a balance checker for sdUSD that will be deployed to Fraxtal mainnet, based on existing dLEND balance checker and Flox Farms documentation requirements.

## Analysis Summary

### Existing dLEND Balance Checker Architecture
- **Contract**: `dLendBalanceChecker.sol`
- **Interface**: `IBalanceChecker.sol` 
- **Key Methods**:
  - `tokenBalances(address token, address[] addresses)` - Single token balance check
  - `batchTokenBalances(address[] sources, address[] addresses)` - Multi-token aggregated balance check
- **Effective Balance Calculation**: `userBalance * (totalSupply - totalDebt) / totalSupply`
- **Features**:
  - External token mapping support
  - Decimal normalization to 18 decimals
  - Batch processing up to 1000 addresses
  - Access control for admin functions

### sdUSD System Overview
Key deployed contracts on Fraxtal mainnet:
- **sdUSD Token**: `0x58AcC2600835211Dcb5847c5Fa422791Fd492409` (DStakeToken)
- **dUSD AToken**: `0x29d0256fe397F6e442464982C4Cba7670646059b` 
- **Underlying dUSD**: Retrieved from AToken contract
- **Collateral Vault**: DStakeCollateralVault_sdUSD
- **Router**: DStakeRouter_sdUSD

### sdUSD Architecture Differences
Unlike dLEND's direct aToken approach, sdUSD uses:
1. **ERC4626 Vault Structure**: sdUSD is an ERC4626-compliant vault token
2. **DStake System**: Uses DStakeCollateralVault for underlying asset management
3. **Conversion Adapters**: WrappedDLendConversionAdapter for dUSD integration
4. **Router Pattern**: DStakeRouter handles deposits/withdrawals

## Requirements from Flox Farms Documentation
- Support `tokenBalances` or `batchTokenBalances` methods
- Handle batch queries for 1000 users
- Use 18 decimal precision
- Naming: `sdUSDBalanceChecker`
- Calculate "effective balance" based on farm-specific parameters

## Design Proposal

### Architecture
```
sdUSDBalanceChecker
├── IBalanceChecker interface compliance
├── sdUSD token integration (ERC4626)
├── dUSD underlying asset support
└── Decimal normalization to 18 decimals
```

### Key Components
1. **sdUSD Token Balance Calculation**:
   - Get user's sdUSD shares
   - Convert to underlying dUSD amount using ERC4626 `convertToAssets`
   - Apply any additional effective balance logic

2. **dUSD Direct Balance Support**:
   - Support direct dUSD token queries
   - Map dUSD to sdUSD for conversion

3. **Batch Processing**:
   - Aggregate sdUSD + dUSD balances per address
   - Normalize all results to 18 decimals

## Implementation Status
- [x] Design completed
- [ ] Contract implementation (In Progress)
- [ ] Test suite creation (Pending)
- [ ] Deployment script (Pending)
- [ ] PR creation (Pending)

## Implementation Tasks
1. Create sdUSDBalanceChecker contract following IBalanceChecker interface
2. Implement ERC4626 vault integration for share-to-asset conversion
3. Add support for both sdUSD and dUSD token queries
4. Create comprehensive test suite covering all scenarios
5. Create deployment script for Fraxtal mainnet
6. Open PR with implementation