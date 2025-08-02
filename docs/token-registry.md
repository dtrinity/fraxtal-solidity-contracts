# Token Registry System

## Overview

The token registry system provides a unified way to manage token deployments across different strategies and environments. It solves the issue of tokens that are deployed but not included in `mintInfos` (like dUSD).

## Token Deployment Strategies

1. **MINT** - Tokens with pre-minted supply (configured in `mintInfos`)
   - Example: DUSD, FXS, SFRAX
   - These tokens have initial balances minted to specific addresses

2. **DEPLOY_ONLY** - Tokens deployed without pre-minted supply
   - Example: dUSD (the production stablecoin)
   - These tokens are deployed but have no initial minted supply

3. **EXTERNAL** - External tokens not deployed by us
   - Used for mainnet/testnet configurations
   - Addresses provided via `lending.reserveAssetAddresses`

## Usage

### Import the Registry

```typescript
import { 
  getTokenRegistry, 
  getTokenAddresses, 
  getTokenAddress,
  hasToken,
  TokenDeploymentStrategy 
} from "../utils/token-registry";
```

### Get All Token Addresses

```typescript
const addresses = await getTokenAddresses(hre);
// Returns: { DUSD: "0x...", dusd: "0x...", FXS: "0x...", ... }
```

### Check if a Token Exists

```typescript
const exists = await hasToken(hre, "dUSD");
// Returns: true if token is in registry and has an address
```

### Get Token Registry Details

```typescript
const registry = await getTokenRegistry(hre);
// Returns full registry with deployment strategies and aliases
```

## Configuration

### Default Registry

The system includes default configurations for known tokens:

```typescript
{
  dUSD: {
    strategy: TokenDeploymentStrategy.DEPLOY_ONLY,
    aliases: ["dusd"]
  },
  DUSD: {
    strategy: TokenDeploymentStrategy.MINT,
    aliases: ["dusd"]
  }
}
```

### Network-Specific Overrides

Networks can override the default registry via `config.tokenRegistry`:

```typescript
export const config: Config = {
  // ... other config ...
  tokenRegistry: {
    tokens: {
      "CUSTOM": {
        strategy: "external",
        address: "0x...",
        aliases: ["custom", "CSTM"]
      }
    }
  }
};
```

## Integration with Lending Module

The `getReserveTokenAddresses()` function now uses the token registry:

```typescript
// Before (with hardcoded dUSD fix)
if (dUSDDeployment) {
  tokenAddresses["dUSD"] = dUSDDeployment.address;
  tokenAddresses["dusd"] = dUSDDeployment.address;
}

// After (using registry)
const tokenAddresses = await getTokenAddresses(hre);
```

## Benefits

1. **Extensible** - Easy to add new token deployment strategies
2. **Unified** - Single source of truth for token resolution
3. **Flexible** - Supports aliases for case-insensitive lookups
4. **Clean** - No more hardcoded special cases in business logic
5. **Testable** - Clear separation of concerns

## Migration Guide

1. Replace direct `mintInfos` access with `getTokenRegistry()` calls
2. Use `getTokenAddresses()` instead of manually building token maps
3. For new tokens without pre-minted supply, add them to `DEFAULT_TOKEN_REGISTRY`
4. For network-specific tokens, use the `tokenRegistry` config option