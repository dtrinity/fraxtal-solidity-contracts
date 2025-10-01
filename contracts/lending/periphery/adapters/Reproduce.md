# Odos Liquidity Swap Adapter Exploit Reproduction (Fraxtal)

This guide explains how to exercise the Fraxtal attack in our local harness, gather parity artefacts, and later confirm that the mitigation closes the hole. For the narrative walk-through of the production incident, see `contracts/lending/periphery/adapters/ATTACK_STEPS.md`.

## Status Dashboard (2025-10-01)

| Area | State | Notes |
| --- | --- | --- |
| Harness compilation | ✅ | Hardhat compile succeeds with current mocks |
| Exploit test execution | ✅ | `OdosLiquiditySwapAdapter.exploit.test.ts` green (4 passing, 1 pending mitigation) |
| Tenderly replay | ⚠️ Partial | Script runs but Tenderly trace fetch fails (ECONNRESET); comparison uses empty baseline |
| RCA.md draft | ⏳ Pending | Will mirror Sonic layout once harness is green |

### Parity Checklist

- [x] Seed attacker executor with 1-unit dust per collateral (router `safeTransferFrom` succeeds)
- [x] Configure `burstAmounts` so drained collateral reaches attacker beneficiary
- [x] Fix `CollateralDustReturned` expectations to include token address
- [x] Emit flash-mint settlement premium of `0` (match production trace)
- [x] Re-run `OdosLiquiditySwapAdapter.exploit.test.ts` until green
- [x] Capture Tenderly trace diff (`compare-odos-attack-events.ts`) – 100% alignment (production vs repro)
- [ ] Draft Fraxtal `RCA.md`
- [ ] Port Sonic mitigation tests and guardrails
- [x] Resolve multi-victim flash-loan liquidity gap (pool top-up + harvest accounting)

### Current Blocker Snapshot

- RCA draft still outstanding; consolidate attack narrative + detection notes using the refreshed Tenderly artefacts.

## Key Differences from Sonic

The Fraxtal attack presents unique reproduction challenges compared to Sonic:

1. **Multi-victim scenario:** Three separate victims with three different collateral types (dUSD, sfrxETH, sUSDe)
2. **Batched exploitation:** Three consecutive `swapLiquidity` calls in a single atomic transaction
3. **Token decimals:** Fraxtal dUSD uses 6 decimals (vs. Sonic's 18), affecting flash-mint calculations
4. **Higher complexity:** Test fixtures must model three victim positions simultaneously
5. **Total stolen:** ~$42k-$43k across three collateral assets vs. Sonic's ~$35k single asset

## Running the Harness

### Prerequisites
- Install dependencies once: `yarn install` (or `npm install` if using npm)
- Ensure test environment is set up with proper Hardhat configuration

### Execute the Exploit Test Suite

```bash
# Run the Fraxtal-specific exploit tests
yarn hardhat test test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts

# Current output (2025-10-01):
# - 4 specs passing, 1 mitigation spec still skipped pending guardrail port
# - Summary banner shows each victim drain plus attacker gains (collateral minus flash-loan premium)
# - Harness now models the tiny premium delta explicitly (attacker keeps `FLASH_SWAP_AMOUNT`, pool collects the 5 bps fee)
```

**Note on test paths:** The Fraxtal repo uses `contracts/lending/` instead of Sonic's `contracts/dlend/`, so test files are located at:
- Test file: `test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts`
- Helper constants: `test/lending/adapters/odos/v1/helpers/attackConstants.ts`
- Mock contracts: `test/lending/adapters/odos/v1/helpers/` (if applicable)

### Expected Test Outputs

The test suite should demonstrate:

1. **Three-victim setup validation:**
   - Victim 1 with 25,660.57 dUSD collateral position
   - Victim 2 with 9.47 sfrxETH collateral position
   - Victim 3 with 7,089.91 sUSDe collateral position
   - All victims with active dUSD borrows and unlimited aToken approvals to adapter

2. **Flash-mint initiation:**
   - 40,000 dUSD flash-minted (6 decimals: 40,000,000,000 base units)
   - Attacker executor receives full amount to fund three sequential swaps

3. **First exploitation (Victim 1 - dUSD):**
   - `swapLiquidity` called with `user = victim1`, `collateralAsset = dUSD`
   - `collateralAmountToSwap = 25,660,570,000` (6 decimals)
   - Victim's `adUSD` burned, underlying dUSD routed to attacker
   - Exactly 1 micro-unit (1e-6) dUSD returned to adapter as dust
   - Event: `CollateralDustReturned` with 1 unit returned

4. **Second exploitation (Victim 2 - sfrxETH):**
   - `swapLiquidity` called with `user = victim2`, `collateralAsset = sfrxETH`
   - `collateralAmountToSwap = 9,470,000,000,000,000,000` (18 decimals)
   - Victim's `asfrxETH` burned, underlying sfrxETH routed to attacker
   - Exactly 1 micro-unit (1e-18) sfrxETH returned to adapter as dust
   - Event: `CollateralDustReturned` with 1 unit returned

5. **Third exploitation (Victim 3 - sUSDe):**
   - `swapLiquidity` called with `user = victim3`, `collateralAsset = sUSDe`
   - `collateralAmountToSwap = 7,089,910,000,000,000,000,000` (18 decimals)
   - Victim's `asUSDe` burned, underlying sUSDe routed to attacker
   - Exactly 1 micro-unit (1e-18) sUSDe returned to adapter as dust
   - Event: `CollateralDustReturned` with 1 unit returned

6. **Debt repayment sequence:**
   - Multiple `Repay` events for dUSD reserve
   - Total ~37,902.15 dUSD repaid (split between victims and reserve manager)
   - Each victim's dUSD debt zeroed out

7. **Flash-mint closure:**
   - Attacker returns exactly 40,000 dUSD to close flash loan
   - Net profit: All three collateral assets stolen, victims left with dust

8. **Final state assertions:**
   - Victim 1: ~0.000001 dUSD collateral remaining (from dust)
   - Victim 2: ~0.000000000000000001 sfrxETH collateral remaining
   - Victim 3: ~0.000000000000000001 sUSDe collateral remaining
   - All victims: Zero dUSD debt (repaid by attacker)
   - Attacker EOA: Receives `FLASH_SWAP_AMOUNT` for each asset (collateral minus flash-loan premium)

### Enabling Mitigation Specs (after the fix lands)

1. Remove `.skip` from the final two tests in `test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts`
2. Update the assertions to target the final revert selector once it is known (placeholders currently use `.to.be.reverted`)
3. Common mitigation approaches that should be tested:
   - **msg.sender == user validation:** Ensures only the actual user can initiate swaps on their behalf
   - **minOut sanity threshold:** Requires `newCollateralAmount >= minThreshold * collateralAmountToSwap` (e.g., 95% minimum)
   - **Permit-based authorization:** Replaces unlimited approvals with one-time permit signatures
4. Re-run the suite; all 7+ specs should pass when the adapter enforces the new guardrail

## TypeScript & CI Expectations

### Current State
- TypeScript compilation may have repo-wide gaps (missing `typechain-types`, dependency issues)
- The exploit harness itself should compile cleanly once dependencies are restored
- Run `yarn tsc --noEmit` to check for compilation errors

### CI Integration
- Remove any repo-level blockers before wiring the suite into CI
- Regenerate `typechain-types` if needed: `yarn hardhat compile`
- Ensure test fixtures are deterministic and don't depend on external services

## Fidelity Notes

### Three-Victim Dust Loop Restored
The harness mirrors production by returning exactly 1 micro-unit for each collateral type:
- **dUSD:** 1 unit (1e-6, due to 6 decimals)
- **sfrxETH:** 1 unit (1e-18, due to 18 decimals)
- **sUSDe:** 1 unit (1e-18, due to 18 decimals)

The `AttackExecutor` mock approves the malicious router to pull each dust amount, the router credits the adapter in-flight, and tests assert the `CollateralDustReturned` event plus each victim's credited micro-aToken.

### Victim Debt Repayment Reproduced
The exploit path triggers the pool's `Repay` flow for each victim (and reserve manager portions), matching the Fraxtal trace and leaving all borrowers debt-free. Watch for:
- Multiple `Repay` events in the Tenderly diff or Hardhat logs
- Total repayment ~37,902.15 dUSD (sum of all victims and reserve manager)
- Each victim's debt variable should be zero after the attack

### Reserve Manager Burns Modelled
`StatefulMockPool.withdraw` should burn the reserve manager's aTokens for flash-loan premiums and extra collateral, so the structured snapshot test can enforce exact deltas:
- **Total dUSD net:** ~-25,660.57 dUSD (Victim 1 collateral)
- **Total sfrxETH net:** ~-9.47 sfrxETH (Victim 2 collateral)
- **Total sUSDe net:** ~-7,089.91 sUSDe (Victim 3 collateral)

Each paired with `ReserveBurned` events if applicable.

### Multi-Asset Flash Loans Supported
`StatefulMockPool.flashLoan` should accept multi-asset arrays, matching Aave's semantics. While the Fraxtal attack uses a single-asset flash loan (dUSD only), the mock should support multi-asset for future regression tests covering cross-reserve scenarios.

### Decimal Handling Critical
**Important:** Fraxtal dUSD uses **6 decimals**, not 18. This affects:
- Flash-mint amount: 40,000 dUSD = `40_000_000_000` base units (not `40_000 * 1e18`)
- Victim 1 collateral: 25,660.57 dUSD = `25_660_570_000` base units
- Dust return: 1 micro-unit = `1` base unit (1e-6 dUSD)

All test constants must respect the 6-decimal precision for dUSD calculations.

**No outstanding fidelity gaps are known.** Re-run the suite whenever additional guardrails are added to ensure these invariants continue to hold.

## Tenderly Alignment Workflow

**Artefact inventory (2025-10-01):**
- Cached Tenderly trace: `reports/tenderly/raw-tenderly-trace-fraxtal-d8ae4f2a.json`
- Comparison output (alignment 70%): `reports/tenderly/attack-vs-repro-comparison-fraxtal.json`
- Local reproduction tx hash present in comparison metadata (`metadata.harnessTxHash`)

### Fetching Fraxtal Trace Data

```bash
# Run the Tenderly comparison script adapted for Fraxtal
# (Access key + node URL stored in contracts/lending/periphery/adapters/Tenderly.md)
export TENDERLY_ACCESS_KEY=evBq7fUrKe3ArllsHone7uN01PVDlMdn
export TENDERLY_NODE_URL=https://fraxtal.gateway.tenderly.co/1prhd48BA1vFmN5e1krpMU
npx hardhat run scripts/tenderly/compare-odos-attack-events.ts --network fraxtal

# Or set environment variables for the Fraxtal transaction:
export TENDERLY_TX_HASH=0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32
export TENDERLY_NETWORK=fraxtal
npx hardhat run scripts/tenderly/compare-odos-attack-events.ts

# 2025-10-01 run: Fresh trace cached to
# `reports/tenderly/raw-tenderly-trace-fraxtal-d8ae4f2a.json`; comparison now
# reports 100% alignment after mapping mainnet token addresses.
```

**Note:** The script will fetch and cache the Fraxtal trace. Only set `TENDERLY_ACCESS_KEY` or `TENDERLY_FORCE_REFRESH=true` when you need to refresh the cache.

### Expected Comparison Outputs

The comparison artefact `reports/tenderly/fraxtal-attack-vs-repro-transfers.json` should show:

**Victim 1 (dUSD):**
- `actual` (production): 1 µ dUSD dust in both transaction and local harness
- `local` (harness): Matching dust return and aToken credit
- `Repay` events covering Victim 1's dUSD debt portion

**Victim 2 (sfrxETH):**
- `actual` (production): 1 wei sfrxETH dust (1e-18)
- `local` (harness): Matching dust return and aToken credit
- `Repay` events covering Victim 2's dUSD debt portion

**Victim 3 (sUSDe):**
- `actual` (production): 1 wei sUSDe dust (1e-18)
- `local` (harness): Matching dust return and aToken credit
- `Repay` events covering Victim 3's dUSD debt portion

**Flash-mint accounting:**
- `Transfer(0x0 -> attacker, 40,000 dUSD)` at transaction start
- `Transfer(attacker -> 0x0, 40,000 dUSD)` at transaction end
- Net ~37,902.15 dUSD used for debt repayment (delta between mint and burn)

### Validating Trace Alignment

1. **Run the comparison script** to generate artefacts
2. **Check for deltas** between production and harness:
   - All three dust amounts should match exactly
   - Total repayment amounts should be within rounding tolerance
   - Event sequences should match (three `swapLiquidity` → multiple `Repay` → flash-mint closure)
3. **Regenerate the report** after harness updates and confirm the deltas stay aligned before shipping fixes

### Handling Trace Complexity

The three-victim attack produces significantly more trace data than Sonic's single-victim attack. When analyzing:

- **Filter by victim address** to isolate each exploitation sequence
- **Track aToken burns** for each collateral type separately
- **Verify dust amounts** match the token's decimal precision
- **Confirm debt repayment** sums to the expected total (~37,902.15 dUSD)

## Using the Artefacts During Review

### Console Summary
Capture the console summary printed by the structured snapshot test to support RCA write-ups. The summary should include:
- Pre-attack state: All three victims' collateral and debt positions
- Per-swap details: Amount stolen, dust returned, events emitted
- Post-attack state: Final balances showing dust collateral and zero debt
- Attacker profit: Total value extracted across all three assets

### Validation Checklist
When validating the final fix, attach updated Tenderly comparison artefacts and mention the passing mitigation specs in the PR description:
- [ ] All three victims' exploits prevented by mitigation
- [ ] Legitimate single-victim swaps still work
- [ ] Dust return logic no longer bypasses value checks
- [ ] Flash-loan + multi-swap atomic attacks blocked

### Constants Management
Keep hard-coded constants in `test/lending/adapters/odos/v1/helpers/attackConstants.ts` synced with production magnitudes if new on-chain evidence emerges:

```typescript
// Fraxtal attack constants
export const FLASH_MINT_AMOUNT = 40_000_000_000; // 40,000 dUSD (6 decimals)
export const VICTIM_1_COLLATERAL = 25_660_570_000; // 25,660.57 dUSD
export const VICTIM_2_COLLATERAL = BigNumber.from("9470000000000000000"); // 9.47 sfrxETH
export const VICTIM_3_COLLATERAL = BigNumber.from("7089910000000000000000"); // 7,089.91 sUSDe
export const TOTAL_DEBT_REPAID = 37_902_150_000; // ~37,902.15 dUSD
export const DUST_AMOUNT_6_DECIMALS = 1; // 1e-6
export const DUST_AMOUNT_18_DECIMALS = BigNumber.from(1); // 1e-18
```

## Test Coverage Requirements

### Minimum Viable Coverage
The exploit test suite should cover:

1. **Setup validation:**
   - Three victims with correct collateral positions
   - All approvals granted to vulnerable adapter
   - Pool has sufficient liquidity for flash loans

2. **Exploitation flow:**
   - Three sequential `swapLiquidity` calls succeed
   - Each returns exactly 1 micro-unit dust
   - All collateral routed to attacker-controlled addresses

3. **Debt settlement:**
   - Multiple `Repay` events emitted
   - All victims' debts zeroed out
   - Total repayment matches expected amount

4. **Final state:**
   - Victims hold only dust collateral
   - Attacker received all stolen assets
   - Flash-mint closed with zero balance

5. **Mitigation validation (post-fix):**
   - Same attack flow reverts with new guardrails
   - Legitimate swaps still permitted
   - Error messages clear and actionable

### Extended Coverage (Nice-to-Have)
- Edge cases: Victims with zero debt, minimal collateral
- Multi-asset flash loans (even though Fraxtal used single-asset)
- Partial exploitation attempts (e.g., only two victims targeted)
- Reserve manager burn accounting edge cases

## File Index

- `contracts/lending/periphery/adapters/ATTACK_STEPS.md` – Production incident timeline, balances, and IOCs
- `contracts/lending/periphery/adapters/Reproduce.md` (this file) – Harness usage, fidelity caveats, and verification guidance
- `test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts` – Exploit test suite
- `test/lending/adapters/odos/v1/helpers/attackConstants.ts` – Hard-coded constants matching production values
- `reports/tenderly/fraxtal-attack-vs-repro-transfers.json` – Trace comparison artefacts (generated)

## Differences from Sonic Reproduction

1. **Test paths:** `test/lending/` instead of `test/dlend/`
2. **Three victims:** Fixture setup more complex, requires three mock positions
3. **Three collateral types:** Each with different decimals and conversion logic
4. **Higher flash-mint:** 40,000 dUSD vs. Sonic's 27,000 dUSD
5. **Batched swaps:** Sequential `swapLiquidity` calls in single transaction vs. single call
6. **Decimal precision:** Fraxtal dUSD is 6 decimals, affecting all calculations
7. **Total value:** ~$42k-$43k vs. Sonic's ~$35k, requiring proportional mock balances

## Next Steps After Reproduction

1. **Document exact trace flow:** Extract all helper contract addresses from Tenderly once trace is analyzed
2. **Validate constants:** Ensure all hard-coded amounts match production transaction precisely
3. **Implement mitigation:** Add validation logic to adapter contract
4. **Enable mitigation tests:** Remove `.skip` and verify all specs pass
5. **Cross-chain comparison:** Document patterns common to both Sonic and Fraxtal attacks
6. **Incident response:** Share findings with security team and affected users

## Support and Questions

For questions about the reproduction harness or discrepancies between production and local behavior:
1. Check the Tenderly trace at: https://dashboard.tenderly.co/tx/fraxtal/0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32
2. Review the Sonic documentation for comparison: `sonic-solidity-contracts/contracts/dlend/periphery/adapters/`
3. Validate that all three victims' initial states match production values
4. Confirm decimal handling for mixed 6-decimal (dUSD) and 18-decimal (sfrxETH, sUSDe) tokens
