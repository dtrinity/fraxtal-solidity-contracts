# Tenderly Integration for Fraxtal Attack Analysis

This directory contains scripts and utilities for analyzing the Fraxtal attack using Tenderly's transaction tracing capabilities.

## Overview

The Tenderly integration allows us to:
1. Fetch detailed transaction traces from Tenderly
2. Analyze token transfers and call traces
3. Compare actual attack behavior with local reproductions
4. Generate comprehensive comparison reports

## Setup

### 1. Environment Configuration

The `.env` file in the project root contains the necessary Tenderly credentials:

```bash
TENDERLY_ACCESS_KEY=evBq7fUrKe3ArllsHone7uN01PVDlMdn
TENDERLY_PROJECT_SLUG=project
TENDERLY_NETWORK=fraxtal
TENDERLY_TX_HASH=0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32
TENDERLY_NODE_URL=https://fraxtal.gateway.tenderly.co/1prhd48BA1vFmN5e1krpMU
```

### 2. Directory Structure

```
fraxtal-solidity-contracts/
├── scripts/tenderly/                    # Tenderly analysis scripts
│   ├── fetch-fraxtal-attack-trace.ts   # Fetch raw traces
│   ├── compare-odos-attack-events.ts   # Compare actual vs reproduced
│   └── README.md (this file)
├── typescript/tenderly/                 # Tenderly client utilities
│   └── client.ts                       # Core Tenderly API client
├── test/lending/adapters/odos/v1/
│   ├── fixtures/setup.ts               # Test fixture setup
│   └── helpers/attackConstants.ts      # Attack constants
└── reports/tenderly/                    # Output directory
    ├── raw-tenderly-trace-fraxtal-d8ae4f2a.json
    └── attack-vs-repro-comparison-fraxtal.json
```

## Usage

### 1. Fetching the Attack Trace

To fetch the Fraxtal attack transaction trace from Tenderly:

```bash
npx hardhat run scripts/tenderly/fetch-fraxtal-attack-trace.ts
```

This will:
1. Connect to Tenderly using credentials from `.env`
2. Fetch the full trace for transaction `0xd8ae4f2a...`
3. Save the trace to `reports/tenderly/raw-tenderly-trace-fraxtal-d8ae4f2a.json`

### 2. Comparing Actual vs Reproduced Attack

To compare the actual Tenderly trace with your local test reproduction:

```bash
npx hardhat run scripts/tenderly/compare-odos-attack-events.ts
```

This will:
1. Load cached Tenderly trace (or fetch if not cached)
2. Run local test reproduction (`OdosLiquiditySwapAdapter.exploit.test.ts`)
3. Extract and compare transfer events from both
4. Generate detailed comparison report with:
   - Per-victim comparison (3 victims)
   - Flash-mint verification
   - Debt repayment verification
   - Alignment score (% match)
   - Discrepancy list

**Output:** `reports/tenderly/attack-vs-repro-comparison-fraxtal.json`

### 3. Force Refresh (Skip Cache)

To force a fresh Tenderly API call instead of using cached data:

```bash
TENDERLY_FORCE_REFRESH=true npx hardhat run scripts/tenderly/compare-odos-attack-events.ts
```

### Environment Variables

All scripts support these environment variables:

```bash
# Required (defaults from .env)
TENDERLY_ACCESS_KEY=your_access_key
TENDERLY_NETWORK=fraxtal
TENDERLY_TX_HASH=0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32

# Optional
TENDERLY_PROJECT_SLUG=project        # Default: "project"
TENDERLY_NODE_URL=https://...        # Custom RPC endpoint
TENDERLY_FORCE_REFRESH=true          # Skip cache, fetch fresh
```

## Attack Details

**Transaction Hash:** `0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32`

**Network:** Fraxtal

**Attack Type:** Three-victim Odos swap adapter vulnerability exploitation

**Key Characteristics:**
- 3 victims with 3 different collateral types (dUSD, sfrxETH, sUSDe)
- Mixed decimals: dUSD (6 decimals), sfrxETH/sUSDe (18 decimals)
- Flash-mint: 40,000 dUSD (vs Sonic's 27,000)
- Dust returns: 1 micro-unit per token
- Total stolen: ~$42,500 USD

## Comparison Report Format

The `attack-vs-repro-comparison-fraxtal.json` report includes:

```typescript
{
  metadata: {
    generatedAt: string;          // ISO timestamp
    txHash: string;               // Original tx hash
    network: string;              // "fraxtal"
    harnessTxHash: string;        // Local test tx hash
  };
  actual: {
    transfers: TenderlyTransferEvent[];  // From Tenderly
    callTraceExcerpt: string;            // First 4 calls
    error?: string;                       // API error if any
    usedCache?: boolean;                  // Cache usage flag
  };
  local: {
    transfers: LocalTransferEvent[];     // From test
    customEvents: LocalEventSummary[];   // Router/executor events
  };
  comparison: {
    victims: VictimComparison[];         // Per-victim comparison
    flashMint: {
      actual: bigint;
      reproduced: bigint;
      matches: boolean;
    };
    alignmentScore: number;              // 0-100% match
    discrepancies: string[];             // List of mismatches
  };
}
```

### VictimComparison Structure

For each victim (3 total):

```typescript
{
  victimNumber: 1 | 2 | 3;
  victimName: string;              // "Victim 1 (dUSD)"
  collateralToken: string;         // Token address
  collateralSymbol: string;        // "dUSD", "sfrxETH", "sUSDe"
  decimals: number;                // 6 or 18
  actual: {
    collateralPulled: bigint;
    dustReturned: bigint;
    aTokenBurned: bigint;
  };
  reproduced: {
    collateralPulled: bigint;
    dustReturned: bigint;
    aTokenBurned: bigint;
  };
  matches: {
    collateralPulled: boolean;
    dustReturned: boolean;
    aTokenBurned: boolean;
  };
}
```

## Decimal Handling

The Fraxtal attack involves mixed-decimal tokens:

| Token    | Decimals | Dust Amount | Format         |
|----------|----------|-------------|----------------|
| dUSD     | 6        | 1           | 0.000001 dUSD  |
| sfrxETH  | 18       | 1           | 1e-18 sfrxETH  |
| sUSDe    | 18       | 1           | 1e-18 sUSDe    |

All comparisons respect decimal precision automatically.

## Tenderly Client API

The `typescript/tenderly/client.ts` module provides:

### Functions

- `traceTransaction(params)` - Fetch a transaction trace from Tenderly
- `extractTenderlyTransferEvents(trace)` - Extract all ERC20 Transfer events from a trace
- `summarizeCallTrace(calls)` - Generate a human-readable call trace summary

### Types

- `TenderlyTraceResult` - Complete trace result with logs, call tree, and asset changes
- `TenderlyTransferEvent` - Parsed ERC20 transfer event
- `TenderlyCall` - Individual call in the trace tree
- `TenderlyAssetChange` - Token balance change with metadata

## Troubleshooting

### Issue: "No cached Tenderly trace found"

**Solution:** Ensure `TENDERLY_ACCESS_KEY` is set in `.env`, or run fetch script first:

```bash
npx hardhat run scripts/tenderly/fetch-fraxtal-attack-trace.ts
```

### Issue: "Tenderly RPC error: 401 Unauthorized"

**Solution:** Verify your access key is valid and has proper permissions.

### Issue: Alignment score < 100%

**Possible causes:**
1. Production transaction uses different addresses than test mocks
2. Transfer event ordering differs between actual and reproduced
3. Token addresses don't match (expected for mocks)

**Note:** Focus on **amounts** rather than addresses for comparison accuracy.

### Issue: Test compilation errors

**Solution:** Ensure all dependencies are installed:

```bash
yarn install
npx hardhat compile
```

### Issue: "Cannot find module" errors

**Solution:** Check TypeScript paths are configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "test/*": ["./test/*"],
      "typescript/*": ["./typescript/*"]
    }
  }
}
```

## Expected Output Example

When running the comparison script successfully:

```
Loaded Tenderly trace from cache reports/tenderly/raw-tenderly-trace-fraxtal-d8ae4f2a.json

Wrote comparison artifact to reports/tenderly/attack-vs-repro-comparison-fraxtal.json

=== Three-Victim Attack Comparison ===
Alignment Score: 100%

Victim 1 (dUSD):
  Collateral: 25660.57 dUSD
  Dust: 0.000001 dUSD
  Match: ✓

Victim 2 (sfrxETH):
  Collateral: 9.47 sfrxETH
  Dust: 0.000000000000000001 sfrxETH
  Match: ✓

Victim 3 (sUSDe):
  Collateral: 7089.91 sUSDe
  Dust: 0.000000000000000001 sUSDe
  Match: ✓

Flash Mint:
  Amount: 40000.0 dUSD
  Match: ✓

No discrepancies found - reproduction matches actual attack perfectly!

Actual attack transfer totals
  Token dUSD (0x...) total moved: 25660.57 (raw: 25660570000)
  Token sfrxETH (0x...) total moved: 9.47 (raw: 9470000000000000000)
  Token sUSDe (0x...) total moved: 7089.91 (raw: 7089910000000000000000)

...
```

## Dependencies

The comparison script requires:
- `dotenv` - Environment variable management
- `ethers` - Ethereum interaction
- `hardhat` - Testing framework
- `axios` - HTTP client for Tenderly API

All dependencies are listed in `package.json`.

## Reference

This setup is modeled after the Sonic Tenderly integration at:
`/Users/dazheng/workspace/dtrinity/sonic-solidity-contracts/scripts/tenderly/`

## Next Steps

After running the comparison:

1. Review `attack-vs-repro-comparison-fraxtal.json` for detailed analysis
2. If alignment score < 100%, investigate discrepancies
3. Use comparison data for RCA documentation
4. Verify mitigation by running test with fixed adapter

## Related Files

- Test file: `test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts`
- Constants: `test/lending/adapters/odos/v1/helpers/attackConstants.ts`
- Fixture: `test/lending/adapters/odos/v1/fixtures/setup.ts`
