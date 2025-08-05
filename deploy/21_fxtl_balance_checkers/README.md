# FXTL Balance Checkers Deployment

This directory contains deployment scripts for the new generalized balance checker architecture.

## Architecture Overview

The new architecture consists of:

1. **IBalanceChecker Interface** (`interfaces/IBalanceChecker.sol`)
   - Standardized interface for all balance checker implementations

2. **BaseBalanceChecker Abstract Contract** (`base/BaseBalanceChecker.sol`)
   - Common functionality shared across implementations
   - Access control for external token mappings
   - Decimal normalization utilities
   - Batch processing logic

3. **ERC4626BalanceChecker Implementation** (`implementations/ERC4626BalanceChecker.sol`)
   - Generic balance checker for ERC4626 vault tokens
   - Converts shares to underlying assets
   - Supports external token mappings

4. **DLendBalanceChecker Implementation** (`implementations/DLendBalanceChecker.sol`)
   - Balance checker for dLEND tokens
   - Calculates effective balance considering debt
   - Maintains backward compatibility with existing implementation

## Deployment Scripts

### 00_deploy_erc4626_balance_checker.ts
Deploys a generic ERC4626BalanceChecker instance with a placeholder vault address.

**⚠️ Important**: Update the vault address for production deployment!

### 01_deploy_dlend_balance_checker.ts
Deploys the new DLendBalanceChecker implementation that inherits from BaseBalanceChecker.

### 02_deploy_sdusd_balance_checker.ts
Deploys an ERC4626BalanceChecker specifically configured for the sdUSD token.

## Usage

Deploy all balance checkers:
```bash
npx hardhat deploy --tags fxtl-balance-checkers
```

Deploy specific implementations:
```bash
# Deploy generic ERC4626 balance checker
npx hardhat deploy --tags ERC4626BalanceChecker

# Deploy new dLEND balance checker
npx hardhat deploy --tags DLendBalanceChecker

# Deploy sdUSD-specific balance checker
npx hardhat deploy --tags sdUSD
```

## Migration Strategy

1. Deploy new implementations alongside existing ones
2. Test the new implementations thoroughly
3. Update client applications to use new contract addresses
4. Verify backward compatibility
5. Gradually migrate usage from old to new implementations

## Key Features

- **Backward Compatibility**: All existing interfaces continue to work
- **Extensibility**: Easy to add new token types by extending BaseBalanceChecker
- **Gas Optimization**: Shared logic reduces deployment costs
- **Type Safety**: Proper inheritance and interface compliance
- **Reusability**: Generic implementations work with multiple token types