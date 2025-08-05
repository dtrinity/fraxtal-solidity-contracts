# Balance Checker Architecture Analysis

## Phase 1: Research and Analysis

### Current Implementation Analysis

#### 1. sdUSDBalanceChecker (ERC4626)
**Location:** `/contracts/vaults/dstake/sdUSDBalanceChecker.sol`

**sdUSD-Specific Elements:**
- Contract name: `sdUSDBalanceChecker`
- Immutable variable: `SD_USD_TOKEN`
- Mapping name: `externalSourceToSdUSDToken`
- Error messages and variable names containing "sdUSD"
- Documentation references to "sdUSD tokens"

**Generic ERC4626 Functionality:**
- Uses `IERC4626.asset()` to get underlying asset
- Uses `IERC4626.convertToAssets()` for share-to-asset conversion
- Decimal normalization to 18 decimals
- External token mapping pattern
- Balance calculation logic for vault shares

**Hardcoded Values to Generalize:**
- Constructor parameter name: `sdUSDToken` → `vaultToken`
- Function parameter names: `sdUSDToken` → `vaultToken`
- Mapping variable: `externalSourceToSdUSDToken` → `externalSourceToVaultToken`
- Error message: "INVALID_SDUSD_TOKEN_ADDRESS" → "INVALID_VAULT_TOKEN_ADDRESS"

#### 2. dLendBalanceChecker
**Location:** `/contracts/dlend/dLendBalanceChecker.sol`

**dLEND-Specific Elements:**
- Uses Aave-specific interfaces (`IAToken`, `IVariableDebtToken`, `IPool`)
- Complex utilization ratio calculation: `(totalSupply - totalDebt) / totalSupply`
- Debt token validation and retrieval
- Aave protocol integration

**Common Patterns with sdUSD:**
- Same `IBalanceChecker` interface implementation
- External token mapping pattern (`externalSourceToDToken`)
- Decimal normalization to 18 decimals
- Batch processing logic
- Access control with `DEFAULT_ADMIN_ROLE`

#### 3. IBalanceChecker Interface
**Location:** `/contracts/dlend/interfaces/IBalanceChecker.sol`
- Generic interface that works for both implementations
- Two main functions: `tokenBalances()` and `batchTokenBalances()`
- Returns normalized 18-decimal balances

### Architectural Comparison

| Aspect | dLEND | sdUSD |
|--------|-------|-------|
| Balance Logic | Complex (supply - debt ratio) | Simple (share conversion) |
| Token Standard | Aave aTokens | ERC4626 vaults |
| Dependencies | Aave protocol contracts | Standard ERC4626 |
| Validation | Multi-step (dToken + debt validation) | Single-step (ERC4626 validation) |
| External Mapping | `externalSourceToDToken` | `externalSourceToSdUSDToken` |

## Phase 2: Architecture Design

### Proposed Class Hierarchy

```
IBalanceChecker (interface)
    ├── BaseBalanceChecker (abstract)
    │   ├── ERC4626BalanceChecker (concrete)
    │   └── DLendBalanceChecker (existing, refactored)
    └── Legacy implementations (for backward compatibility)
```

### Core Components

#### 1. Enhanced IBalanceChecker Interface
- Keep existing interface unchanged for backward compatibility
- Add optional utility functions in a separate interface if needed

#### 2. BaseBalanceChecker (Abstract Contract)
- Common functionality: decimal normalization, batch processing, access control
- Abstract methods for token validation and balance calculation
- Shared external token mapping pattern

#### 3. ERC4626BalanceChecker (Generic Implementation)
- Constructor takes any ERC4626 vault address
- Generic naming throughout
- Supports multiple vault types through deployment

#### 4. Refactored DLendBalanceChecker
- Inherits from BaseBalanceChecker
- Implements dLEND-specific logic
- Maintains existing API for backward compatibility

### Interface Design

```solidity
// Enhanced interface (optional, separate file)
interface IBalanceCheckerExtended is IBalanceChecker {
    function getUnderlyingAsset(address token) external view returns (address);
    function getSupportedTokens() external view returns (address[] memory);
}

// Base abstract contract
abstract contract BaseBalanceChecker is IBalanceChecker, AccessControl {
    mapping(address => address) public externalSourceToInternalToken;
    
    function mapExternalSource(address external, address internal) external;
    function batchTokenBalances(...) external view override; // Common implementation
    
    // Abstract methods for specialization
    function _validateTokenAndGetDetails(...) internal view virtual returns (...);
    function _calculateBalance(...) internal view virtual returns (uint256);
}

// Generic ERC4626 implementation
contract ERC4626BalanceChecker is BaseBalanceChecker {
    address public immutable VAULT_TOKEN;
    
    constructor(address initialAdmin, address vaultToken);
    function _validateTokenAndGetDetails(...) internal view override returns (...);
    function _calculateBalance(...) internal view override returns (uint256);
}
```

## Phase 3: Directory Structure Proposal

### Recommended Organization

```
contracts/
├── fxtl_balance_checkers/
│   ├── interfaces/
│   │   ├── IBalanceChecker.sol (moved from dlend/interfaces/)
│   │   └── IBalanceCheckerExtended.sol (optional)
│   ├── base/
│   │   └── BaseBalanceChecker.sol
│   ├── implementations/
│   │   ├── ERC4626BalanceChecker.sol
│   │   └── DLendBalanceChecker.sol (refactored)
│   └── legacy/
│       ├── sdUSDBalanceChecker.sol (backward compatibility)
│       └── dLendBalanceChecker.sol (backward compatibility)
├── dlend/
│   └── ... (other dlend contracts)
└── vaults/dstake/
    └── ... (other dstake contracts, sdUSDBalanceChecker removed)
```

### Migration Benefits
1. **Centralized**: All balance checkers in one location
2. **Extensible**: Easy to add new token standard support
3. **Maintainable**: Shared code in base classes
4. **Backward Compatible**: Legacy contracts remain functional
5. **Clean Separation**: Clear distinction between interface, base, and implementations

## Trade-offs Analysis

### Benefits
- **Code Reuse**: Eliminates duplication between implementations
- **Consistency**: Unified patterns across all balance checkers
- **Extensibility**: Easy to add support for new token standards
- **Maintainability**: Centralized logic reduces maintenance burden
- **Testing**: Shared test patterns and utilities

### Considerations
- **Complexity**: Introduces inheritance hierarchy
- **Gas Costs**: Minimal impact due to view functions
- **Migration Effort**: Requires careful deployment and testing
- **Backward Compatibility**: Need to maintain legacy contracts during transition

## Recommendation

Proceed with the proposed architecture as it significantly improves code organization and reusability while maintaining backward compatibility. The generalized ERC4626BalanceChecker will serve as a template for future vault integrations.

## Next Steps
1. User feedback on architectural decisions
2. Implementation of base contracts and interfaces
3. Migration plan for existing deployments
4. Comprehensive testing strategy