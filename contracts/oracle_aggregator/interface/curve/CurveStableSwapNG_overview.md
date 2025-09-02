### Scope
- Covers `CurveStableSwapNG` (plain NG pools, up to 8 coins) and `CurveStableSwapMetaNG` (2-coin meta pools where `coins[1]` is a base pool LP token), plus `CurveStableSwapNGViews` helpers.
- Emphasizes flows, parameters, oracle math, edge cases, and safe integration patterns.

- Key highlights:
  - Oracles are E-MA of AMM state price and TVL D; price indices quote `coins[k]` vs `coins[0]`.
  - Dynamic fees scale with imbalance; admin fees accrue in-kind per coin.
  - Rebasing tokens change transfer and balance semantics; avoid `exchange_received` there.
  - `get_virtual_price` is instantaneous; prefer `D_oracle()` smoothing for LP price where manipulation is a concern.

### Core state and math
- Balances used in math are normalized: `xp[i] = stored_rates[i] * balances[i] / 1e18`.
- Invariant D and swap solve:
  - D: iterative StableSwap invariant with amplification A.
  - Swap y: solve for `y = get_y(i, j, x, xp, A, D)` given `x = xp[i] + dx * rate[i] / 1e18`.
- A ramping: `A()` is linearly interpolated from `initial_A` to `future_A` over `MIN_RAMP_TIME` (1 day). Admin can `ramp_A`/`stop_ramp_A`.
- Normalization/rates:
  - NG pools: `stored_rates()` combines per-coin `rate_multipliers` with:
    - Asset type 1 (oracle): raw-call external oracle function (method ID stored) expected 1e18 precision.
    - Asset type 3 (ERC4626): uses `convertToAssets(call_amount)` scaled to 1e18 via `scale_factor`.
  - Meta pools: `stored_rates()` uses a per-coin rate multiplier for `coins[0]`, and `BASE_POOL.get_virtual_price()` for `coins[1]`.

### Fees
- Base fee `fee` and off-peg multiplier `offpeg_fee_multiplier` (both precision 1e10).
- Dynamic fee for a swap between i and j:
  - If `offpeg_fee_multiplier <= 1e10`, use `base_fee`.
  - Otherwise: fee’ = offpeg_multiplier * base_fee / (((offpeg_multiplier - 1e10) * 4*xpi*xpj/(xpi+xpj)^2) + 1e10).
  - Intuition: fee increases as pool becomes imbalanced.
- Admin fee is taken as a proportion of the swap fee into `admin_balances[i]`. Withdrawable by anyone via `withdraw_admin_fees()` to the factory’s `fee_receiver`.

### Swaps
- Entrypoints: `exchange(i, j, dx, min_dy, receiver)` and `exchange_received(...)` (optimistic path).
  - `exchange_received` disallowed when pool contains rebasing tokens.
- Flow:
  - Compute `rates`, `_balances()` (excludes admin balances; for rebasing tokens, reads `balanceOf - admin_balances`; otherwise uses cached `stored_balances`), then `xp`.
  - Transfer in dx via `_transfer_in` (handles fee-on-transfer/rebasing differences).
  - Compute `x`, `y`, `dy = xp[j] - y - 1`, dynamic fee on `dy`, convert to token units, credit admin portion, transfer out, emit event.
  - Update oracles via `upkeep_oracles` with updated `xp` and prior D (swaps don’t change D, fees are accounted separately).
- Meta pools also support `exchange_underlying(i, j, dx, min_dy, receiver)`:
  - If one leg is meta (`i==0` or `j==0`): trade on metapool; if needed withdraw from base via `remove_liquidity_one_coin`.
  - Base-to-base: directly call base pool `exchange`.
  - If input is a base coin and the leg routes through LP, metapool will first add to base pool (`_meta_add_liquidity`) and receive base LP for the swap.

### Liquidity operations
- `add_liquidity(amounts, min_mint_amount, receiver)`:
  - First deposit requires all coins (zero amounts are rejected).
  - Compute D0 and D1; if not first deposit, compute coin-wise ideal vs new balances, charge dynamic fees on the absolute difference, credit admin fees, recompute D1, mint LP proportional to `(D1 - D0)/D0`.
  - Updates price+TVL oracles on non-initial deposits; initializes D oracle on first deposit and sets clock.
- `remove_liquidity(burn_amount, min_amounts, receiver, claim_admin_fees)`:
  - Proportional burn by balance shares; does not update price oracle; updates D oracle proportionally to supply change.
  - Optionally withdraws admin fees.
- `remove_liquidity_imbalance(amounts, max_burn_amount, receiver)`:
  - Charge dynamic fees per-coin on new vs ideal balances, update D and oracles, compute burn.
- `remove_liquidity_one_coin(burn_amount, i, min_received, receiver)`:
  - Compute `D1`, `new_y` for coin i, apply dynamic fees via a reduced `xp_reduced` path, output is `(xp_reduced[i] - y_reduced)` adjusted to token units; update oracles.

### Oracle logic
- Price oracle (state price EMA) and TVL oracle (D EMA) maintained together by `upkeep_oracles(xp, A, D)` on:
  - Swaps, `add_liquidity` (non-initial), `remove_liquidity_imbalance`, `remove_liquidity_one_coin`.
  - Not updated on purely proportional `remove_liquidity` for the price oracle; that call only refreshes D oracle.
- State price computation `_get_p(xp, A, D)`:
  - Returns N_COINS-1 prices: index 0 is price of `coins[1]` in `coins[0]` units, index 1 is `coins[2]` in `coins[0]` units, etc.
  - Metapools expose a single price index (0): `coins[1]` (base LP) in `coins[0]` units.
- Storage and updates:
  - For each price index: store `(last_spot, ema)` packed in 256 bits. When updating, cap `last_spot` at `2e18` (upper bound); lower tail has no cap.
  - EMA uses exponential smoothing with half-life configured by `ma_exp_time` (in seconds/ln(2)); default D EMA window `D_ma_time` is ~12h on init.
  - Read methods:
    - `last_price(i)`: last capped spot state price.
    - `ema_price(i)`: stored EMA.
    - `price_oracle(i)`: lazily computes EMA at read time using `ma_last_time` without mutating storage; protected by nonreentrancy.
    - `D_oracle()`: same pattern for D.
- Practical use:
  - To get price of `coins[k]` in `coins[0]` units: k in [1..N-1] => `price_oracle(k-1) / 1e18`.
  - To convert to e.g. USD, multiply by a trusted price of `coins[0]`.
  - Metapools’ `coins[1]` already embeds `BASE_POOL.get_virtual_price()` in its rate.

### Virtual price (LP pricing)
- `get_virtual_price()` = `D * 1e18 / total_supply`.
  - Caution: documented as potentially vulnerable to donation-style manipulation if pool contains rebasing tokens; integrators should treat it as a signal, not a hard oracle, on such pools.
  - For smoothing, you can compute a time-weighted proxy off-chain: `LP_oracle ≈ D_oracle() * 1e18 / totalSupply()`. This smooths TVL but not supply.
- For metapools, `stored_rates()[1]` is the base pool’s `get_virtual_price()`, so metapool state prices implicitly track base LP valuation.

### Rebasing tokens and balances
- If any coin is rebasing:
  - `_balances()` reads live `balanceOf - admin_balances` so LPs retain rebases; admin only accumulates fees.
  - `_transfer_out` updates cached `stored_balances` using live pre/post `balanceOf`.
  - `exchange_received` is disabled; aggregators must use `exchange` with `transferFrom`.
  - Mislabeling a rebasing token’s `asset_type` can leak rebases to the pool; integration should verify token behavior.

### Nonreentrancy and safety
- All state-changing AMM methods are `@nonreentrant('lock')`. Even read oracles `price_oracle`/`D_oracle` are nonreentrant.
- Rounding: many paths subtract `1` “just in case” prior to fee conversion; allow small headroom in min-dy checks.

### Integration recipes
- Quoting:
  - Plain pools: call `get_dy(i, j, dx)` or `get_dx(i, j, dy)` on the pool (internally dispatched to `StableSwapNGViews`).
  - Metapools: use `get_dy_underlying`/`get_dx_underlying` for cross-base swaps; for meta-level coins, use `get_dy`/`get_dx`.
  - To preview fees: `dynamic_fee(i, j)`.
- Executing swaps:
  - Approve `coins[i]` to pool; call `exchange(i, j, dx, min_dy, receiver)`.
  - For metapool underlying swaps, call `exchange_underlying`.
  - Avoid `exchange_received` unless the pool does not contain rebasing tokens.
- Using prices:
  - Asset oracle: use `price_oracle(i)` where i indexes coin relative to `coins[0]`. Multiply by a trusted `coins[0]` oracle as needed.
  - LP oracle: use `get_virtual_price()` with caution on rebasing pools; or compute a smoothed off-chain proxy from `D_oracle()`.

### Notable edge cases and constraints
- Initial deposit must include every coin (non-zero).
- Price cap: stored `last_price` is capped at `2e18`. The lower side is uncapped; deep depegs below 0.5 can appear in state price.
- Off-peg fee multiplier and fee are admin-set with bounds to keep `offpeg_fee_multiplier * fee` under a maximum.
- Price oracle indices exist only for `coins[1..N-1]` vs `coins[0]`. Metapools expose only index 0.
- `remove_liquidity` updates only the D oracle (price oracle is unchanged until a swap or other non-proportional operation).

- Events:
  - Swaps: `TokenExchange` (or `TokenExchangeUnderlying` for metapools).
  - Liquidity: `AddLiquidity`, `RemoveLiquidity`, `RemoveLiquidityImbalance`, `RemoveLiquidityOne`.
  - Admin: `RampA`, `StopRampA`, `ApplyNewFee`, `SetNewMATime`.
