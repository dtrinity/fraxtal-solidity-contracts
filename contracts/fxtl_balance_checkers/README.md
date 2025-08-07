# FXTL Balance Checkers Architecture

A generalized, extensible architecture for checking token balances across different token implementations in the dTRINITY protocol.

## Overview

This architecture provides a standardized way to check balances for various token types:
- **dLEND tokens**: Effective balance considering debt ratios
- **ERC4626 tokens**: Balance calculated by converting shares to underlying assets  
- **External tokens**: Direct balance queries with decimal normalization

## Architecture Components

### 1. Interface Layer
- **`interfaces/IBalanceChecker.sol`**: Standardized interface for all implementations

### 2. Base Layer
- **`base/BaseBalanceChecker.sol`**: Abstract contract with common functionality
  - Access control for external token mappings
  - Decimal normalization utilities (to 18 decimals)
  - Batch processing logic
  - Common error definitions
  - Address validation helper (NO hard limit on number of addresses; unlimited by protocol design)

### 3. Implementation Layer
- **`implementations/ERC4626BalanceChecker.sol`**: Generic ERC4626 vault balance checker
- **`implementations/DLendBalanceChecker.sol`**: dLEND token balance checker with debt calculations

### 4. Testing Layer
- **`test/BaseBalanceCheckerTest.sol`**: Tests for common functionality
- **`test/ERC4626BalanceCheckerTest.sol`**: Tests for ERC4626 implementation
- **`test/MockERC4626.sol`**: Mock ERC4626 vault for testing

## Key Features

### 🔧 **Extensibility**
- Easy to add new token types by extending `BaseBalanceChecker`
- Abstract methods allow custom balance calculation logic
- Standardized interface ensures compatibility

### 🛡️ **Security & Access Control**
- Role-based access control for external token mappings
- Address validation (no hard-coded limits)
- Proper error handling with custom error types

### ⚡ **Gas Optimization**
- Shared logic in base contract reduces deployment costs
- Efficient batch processing
- Optimized decimal normalization

### 🔄 **Backward Compatibility**
- All existing interfaces continue to work
- New implementations maintain same function signatures
- Gradual migration strategy supported

## Implementation Details

### ERC4626BalanceChecker

For ERC4626 vault tokens, balance calculation:
1. Gets user's shares: `vault.balanceOf(user)`
2. Converts to assets: `vault.convertToAssets(shares)`
3. Normalizes to 18 decimals

```solidity
// For vault tokens
uint256 shares = IERC20(vaultToken).balanceOf(user);
uint256 assets = IERC4626(vaultToken).convertToAssets(shares);
return _normalizeToDecimals18(assets, tokenDecimals);
```

### DLendBalanceChecker  

For dLEND tokens, effective balance calculation:
1. Gets total supply and debt from pool
2. Calculates utilization ratio: `(totalSupply - totalDebt) / totalSupply`
3. Applies ratio to user balance: `userBalance * ratio`
4. Normalizes to 18 decimals

```solidity
// Calculate available ratio (not borrowed)
uint256 ratio = ((totalSupply - totalDebt) * 1e18) / totalSupply;
uint256 effectiveBalance = (userBalance * ratio) / 1e18;
return _normalizeToDecimals18(effectiveBalance, tokenDecimals);
```

## External Token Mapping

Both implementations support mapping external tokens to internal tokens:

```solidity
// Map external token to internal vault/dToken
balanceChecker.mapExternalSource(externalToken, internalToken);

// Query using external token address
uint256[] memory balances = balanceChecker.tokenBalances(externalToken, addresses);
```

## Deployment Strategy

1. **Parallel Deployment**: Deploy new implementations alongside existing ones
2. **Testing**: Comprehensive testing with mock contracts
3. **Migration**: Gradual client migration to new contract addresses  
4. **Validation**: Verify backward compatibility and functionality

## Usage Examples

### Single Token Balance Check
```solidity
address[] memory users = [user1, user2, user3];
uint256[] memory balances = balanceChecker.tokenBalances(tokenAddress, users);
```

### Batch Token Balance Check
```solidity
address[] memory tokens = [token1, token2, token3];
address[] memory users = [user1, user2];
uint256[] memory totalBalances = balanceChecker.batchTokenBalances(tokens, users);
// Returns sum of balances across all tokens for each user
```

### Utility Functions

#### ERC4626BalanceChecker
```solidity
// Get underlying asset
address asset = balanceChecker.getUnderlyingAsset(vaultToken);

// Convert shares to assets
uint256 assets = balanceChecker.convertSharesToAssets(vaultToken, shares);

// Get total vault assets
uint256 totalAssets = balanceChecker.getTotalAssets(vaultToken);
```

#### DLendBalanceChecker
```solidity
// Get utilization ratio
uint256 utilization = balanceChecker.getUtilizationRatio(dToken);

// Get available ratio (portion not borrowed)  
uint256 available = balanceChecker.getAvailableRatio(dToken);

// Get debt token address
address debtToken = balanceChecker.getDebtToken(dToken);
```

## Error Handling

Custom errors provide clear feedback:
- `ExternalTokenNotMapped(address)`: Token not mapped to internal token
- `InvalidToken(address)`: Token validation failed
- `InvalidERC4626Token(address)`: Not a valid ERC4626 vault
- `InvalidDToken(address)`: Not a valid dToken
- `InvalidDebtToken(address)`: Debt token not found
- `NoSourcesProvided()`: Empty sources array in batch call
- `InvalidAddress(address)`: Invalid address provided

## File Structure

```
contracts/fxtl_balance_checkers/
├── interfaces/
│   └── IBalanceChecker.sol           # Standard interface
├── base/
│   └── BaseBalanceChecker.sol        # Common functionality  
├── implementations/
│   ├── ERC4626BalanceChecker.sol     # Generic ERC4626 implementation
│   └── DLendBalanceChecker.sol       # dLEND implementation
├── test/
│   ├── BaseBalanceCheckerTest.sol    # Base contract tests
│   ├── ERC4626BalanceCheckerTest.sol # ERC4626 tests
│   └── MockERC4626.sol               # Mock vault for testing
└── README.md                         # This file
```

## Benefits

1. **Maintainability**: Centralized common logic, easier updates
2. **Consistency**: Standardized interface across all token types  
3. **Flexibility**: Easy to extend for new token types
4. **Efficiency**: Shared code reduces gas costs
5. **Safety**: Proper validation and error handling
6. **Compatibility**: Maintains existing functionality

This architecture provides a solid foundation for balance checking across the dTRINITY protocol while maintaining the flexibility to support future token implementations.