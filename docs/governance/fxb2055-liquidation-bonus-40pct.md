# FXB20551231 Liquidation Bonus Increase: 5% → 40% Penalty (Fraxtal Mainnet)

Status: PROPOSED (rev 2 — bonus leg + liquidationProtocolFee discovery)
Network: Fraxtal mainnet (chainId 252)
Asset: FXB20551231 — `0xc38173D34afaEA88Bc482813B3CD267bc8A1EA83`

## Motivation

Position `0x932bdd2d5e21475e62d2fea8158fc5974507cb1a` is significantly underwater against
FXB20551231 collateral. FXB20551231 exit liquidity is thin (concentrated in the
frxUSD/FXB20551231 Curve-style pool), so liquidators cannot recycle seized FXB into
frxUSD/USD without heavy slippage. At the current 5% liquidation penalty, the liquidator's
full 5% share of repaid debt does not cover swap slippage plus gas, so nobody liquidates and
bad debt accrues to the pool. Raising the penalty to 40% restores a profitable margin for
liquidators.

## Current vs Proposed Configuration

| Parameter | Current (on-chain) | Proposed |
| --- | --- | --- |
| LTV | 6000 (60%) | 6000 (unchanged) |
| Liquidation threshold | 6500 (65%) | 6500 (unchanged) |
| Liquidation bonus | 10500 (5% penalty) | 14000 (40% penalty) |
| Liquidation protocol fee | **0** (see discovery below) | 0 (unchanged — no fee leg scheduled) |

Contract validation: `liquidationThreshold.percentMul(liquidationBonus) = 6500 * 1.4 = 9100 <= 10000` (PoolConfigurator.sol:164).

## Discovery: on-chain liquidationProtocolFee is 0, not 7000

An earlier revision of this doc (and the repo deploy config
`utils/lending/reserves-configs.ts`, where every strategy carries
`liquidationProtocolFee: "7000"`) assumed the on-chain fee was 7000 (protocol keeps 70% of
the penalty). **Reading the live packed reserve configuration disproves this**:

- `Pool.getConfiguration(FXB20551231)` → bits 152–167 (`LIQUIDATION_PROTOCOL_FEE_START_BIT_POSITION`, ReserveConfiguration.sol:64) decode to **0**.
- The same read for dUSD and sfrxUSD also returns 0, while every other packed field (supply
  caps 2000000 / 200000, reserve factor 1000, thresholds, etc.) exactly matches the repo
  config — so the bit layout is decoded correctly and the fee field alone was never applied
  on-chain.
- Corroboration from the competitor liquidation of 2026-08-17
  (`0x3e58540476cb862f5197a0abcced9e97b43d0fd5e923d42675ea4eb205f8686b`): the liquidator
  received the **entire** 106,687.13 FXB seized with no treasury cut. At a 7000 fee the
  treasury would have skimmed ~3,500 FXB and the liquidator would have received only
  ~103,150.

Consequence: a follow-up "lower the fee 7000 → 1500 so liquidators keep 85%" does not exist
on this chain. Scheduling `setLiquidationProtocolFee(FXB20551231, 1500)` would **raise**
the fee from 0 to 1500 and **cut** the liquidator's share of the penalty from 100% to 85% —
the opposite of the stated intent. The fee leg is therefore **not scheduled**; a fully
pre-built, simulated, optional fee-leg payload is included in the bundle JSON for
governance to activate only if it deliberately wants a 15% protocol share of the penalty
(see "Optional fee leg" below). The proposal script aborts unless the on-chain fee is 0 or
7000, so a future fee change is a conscious choice, not a default.

## Effective Bonus Math (corrected)

With the on-chain fee at 0, the liquidator keeps 100% of the penalty and the protocol 0%.

| | 5% penalty (today) | 40% penalty (proposed) | 40% + optional fee 1500 |
| --- | --- | --- | --- |
| Total penalty per unit of repaid debt | 5% | 40% | 40% |
| Liquidator keeps | 5% (100%) | 40% (100%) | 34% (85%) |
| Protocol keeps | 0% | 0% | 6% (15%) |

40% of repaid debt comfortably covers realistic FXB→frxUSD exit slippage on current depth.

## Transaction Path

Governance flow: **Governance Safe → OZ TimelockController → PoolConfigurator**.

- Governance Safe (3-of-5, on-chain threshold): `0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9`
- Timelock (OZ TimelockController, `getMinDelay() = 86400`, Safe holds PROPOSER + EXECUTOR): `0x0bafaDA2a5824864720873EE40cd960b36445212`
- PoolConfigurator: `0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7`

Note: this deployment's `configureReserveAsCollateral(address asset, uint256 ltv, uint256
liquidationThreshold, uint256 liquidationBonus)` takes **4 arguments** — it sets only
ltv/threshold/bonus and leaves every other packed field (including the protocol fee)
untouched (PoolConfigurator.sol:176-180). The fee is changed by a separate
`setLiquidationProtocolFee(address, uint256)` call (valid range 0..10000,
PoolConfigurator.sol:302; storage cap 65535, ReserveConfiguration.sol:76).

1. Safe executes `schedule(0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7, 0, innerCalldata, bytes32(0), salt, 86400)` on the timelock (Safe holds `PROPOSER_ROLE`).
   - Inner calldata: `configureReserveAsCollateral(0xc38173D34afaEA88Bc482813B3CD267bc8A1EA83, 6000, 6500, 14000)`
   - Salt: `keccak256("fxb20551231-liquidation-bonus-40pct")`
2. Wait 86400 seconds (24h) after `schedule()` lands on-chain.
3. Safe executes `execute(0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7, 0, innerCalldata, bytes32(0), salt)` on the timelock (Safe holds `EXECUTOR_ROLE`).

### One batched tx vs sequential txs — tradeoff

A single Safe `execTransaction` carries exactly one `to/data` pair. Batching two different
PoolConfigurator calls into one Safe tx would require MultiSend (DELEGATECALL aggregation);
no MultiSend deployment is verified on Fraxtal mainnet for this Safe, and this Safe is a
forked v1.3.0 build with several view methods missing, so depending on unverified helper
contracts is an unnecessary risk. Sequential is chosen if ever both legs are wanted:

- **Sequential (chosen):** Safe tx @ nonce N schedules the bonus leg; Safe tx @ nonce N+1
  schedules the fee leg. Two signature-collection rounds, but each leg can be reviewed,
  signed and timelocked independently; a fault in one never blocks the other. The two
  timelock operations are independent (different salts) and order-independent
  (`configureReserveAsCollateral` preserves the fee bits, `setLiquidationProtocolFee`
  preserves ltv/threshold/bonus bits).
- **Batched (rejected):** one signature round, but requires an unverified MultiSend contract
  and couples both changes to a single tx.

In the current state (fee on-chain = 0) only **one** Safe tx is scheduled at all — the
bonus leg.

## Execution Runbook (human steps, in order)

Signers (on-chain `getOwners()` at block ~40096764, threshold **3** — collect any 3):

1. `0x17e06ce6914E3969f7BD37D8b2a563890cA1c96e`
2. `0x4B58fF1AAE6AdD7465A5584eBCaeb876ec8f21FD`
3. `0x64dbDD2AAD00383Defc305398F18a019161558CB`
4. `0xDC672ba6e55B71b39FA5423D42B88E7aDF9d24A4`
5. `0x9E0c8376940aBE845A89b7304147a95c72644f59`

1. Merge this PR (`chore/fxb2055-liq-bonus-40pct`).
2. Re-run `corepack yarn ts-node scripts/lending/reserve_configs/propose_fxb2055_liq_bonus.ts`
   — it re-reads the live Safe nonce (a separate pending dUSD proposal shares nonce 193;
   whichever Safe tx executes first bumps the nonce) and regenerates the bundle.
3. **3 of the 5 owners above** sign the printed Safe tx (`to` = timelock, `data` = the
   `schedule(...)` calldata, value 0, operation CALL, nonce from the fresh run) via
   EIP-712 over the `safeTxHash` (domain separator `0xd4655f2f9a43f2cabc7f3387760dec8daf15f5d738590503628616e19509d338`,
   verifying contract `0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9`, chain 252). Sort the 3
   signatures by owner address ascending when assembling `execTransaction`.
4. Anyone submits/executes the Safe `execTransaction` (permissionless with valid sigs).
   This calls `timelock.schedule(...)` — capture the eta (schedule tx timestamp + 86400).
5. Wait ≥ 24 hours (86400s).
6. Anyone calls the Safe to execute `timelock.execute(0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7, 0, innerCalldata, bytes32(0), salt)`
   — the `execute` calldata is pre-built in the bundle JSON (`scheduledLeg.timelock.execute`).
   Verify on the data provider that FXB20551231 now reports `liquidationBonus = 14000`.
7. (Only if governance opts in) Optional fee leg — see below.

## Optional fee leg (NOT scheduled)

If governance deliberately wants the protocol to take 15% of the liquidation penalty
(liquidators keep 85%), the bundle JSON contains a fully pre-built payload:
`feeLeg.timelock.schedule` / `feeLeg.timelock.execute` wrapping
`setLiquidationProtocolFee(FXB20551231, 1500)`, salt
`keccak256("fxb20551231-liquidation-protocol-fee-1500")`. Both legs simulated OK via
read-only `eth_call` (schedule from Safe, inner call from timelock). To activate: re-run the
proposal script, collect a fresh 3-of-5 signature set over the fee-leg schedule tx (new
nonce), execute, wait 86400s, execute the timelock op.

## Ready-to-Sign Payload

The bundle JSON (with `safeTxHash` for the current on-chain nonce, full calldata for
schedule **and** execute legs, nonce proof, signer list) is generated by:

```bash
corepack yarn ts-node scripts/lending/reserve_configs/propose_fxb2055_liq_bonus.ts
```

Output: `reports/governance/fraxtal-mainnet-fxb2055-liq-bonus-40pct.json`. The script runs
read-only simulations of every leg before writing the file and exits non-zero if any
critical simulation fails.

## Verification (read-only, against rpc.frax.com, 2026-08-17 ~22:04 UTC, block 40096764)

- Current on-chain config asserted via data provider: ltv 6000 / lt 6500 / bonus 10500.
- On-chain `liquidationProtocolFee` = 0 via `Pool.getConfiguration` bits 152–167.
- Timelock `getMinDelay() = 86400`; Safe holds PROPOSER_ROLE and EXECUTOR_ROLE;
  `setLiquidationProtocolFee` from the timelock passes auth (eth_call OK), from a random
  address auth-reverts (expected).
- `eth_call` from Safe of `timelock.schedule(...)` (bonus leg): OK.
- `eth_call` from timelock of inner `configureReserveAsCollateral(FXB, 6000, 6500, 14000)`: OK.
- `eth_call` from Safe of `timelock.schedule(...)` (fee leg): OK; inner
  `setLiquidationProtocolFee(FXB, 1500)` from timelock: OK.
- Full `Safe.execTransaction` with 3 dummy owner signatures reverts at the signature check
  (no owner keys exist locally) — rely on the two-level inner-path simulations above; this
  is stated explicitly in the bundle.
- Contract validation: `6500.percentMul(14000) = 9100 <= 10000`.
- Nonce proof: storage slot 5 = 193 at block 40096764, with slot 3 (ownerCount=5) matching
  `getOwners()` and slot 4 (threshold=3) matching `getThreshold()`, confirming the layout.

## Quirks and Cautions

- The governance Safe is a GnosisSafe v1.3.0 fork whose bytecode does not expose
  `getNonce()`, `nonce()` or `getTransactionHash()`. The script reads the nonce from storage
  slot 5 (canonical v1.3.0 layout, calibrated against on-chain `getThreshold()`/`getOwners()`).
- The on-chain threshold is **3**, not 2 as recorded in `manifests/fraxtal-mainnet-roles.json`.
- Any other Safe transaction that executes first bumps the nonce and invalidates the
  pre-computed `safeTxHash` (there is currently a separate pending dUSD proposal). Re-run
  the script to regenerate the payload immediately before collecting signatures.
- The leftover untracked `deployments/fraxtal_mainnet/safe-deployment-state.json` (from the
  dUSD proposal work) contains corrupted calldata and an unreproducible safeTxHash; do not
  trust it for this action.

## Related

- Config change: `utils/lending/reserves-configs.ts` (`strategyFXB20551231.liquidationBonus`)
- Proposal tooling: `scripts/lending/reserve_configs/propose_fxb2055_liq_bonus.ts`
- Payload: `reports/governance/fraxtal-mainnet-fxb2055-liq-bonus-40pct.json`
