# dLEND Swap Adapter Audit Log

## Instructions for Auditors
- Read `contracts/lending/periphery/adapters/Design.md` before diving into code.
- Check for existing findings here before adding a new one to avoid duplicates.
- Record findings under the severity heading with the format:
  - `### [Severity] Title`
  - `- Location: file.sol:line`
  - `- Status: Open`
  - `- Details: ...`
  - `- Reproduction: ...` (required for Critical/High)

## Critical

## High
### [High] DSwap exact-output approvals brick zero-reset tokens
- Timestamp: 2025-09-28T07:49:26Z
- Location: contracts/lending/periphery/adapters/dswap/BaseDSwapBuyAdapter.sol:74
- Status: Open
- Details: `_buyOnDSwap` approves the dSwap router without first clearing the prior allowance, leaving any residual allowance from previous trades in place. Tokens such as USDT require the allowance to be reset to zero before setting a new value; once a repayment trade spends less than `maxAmountToSwap`, the leftover allowance causes every subsequent call to revert and permanently disables the adapter for that asset. There is no recovery path because the contract never zeroes the allowance.
- Reproduction:
  1. Use a supported reserve whose ERC20 enforces “zero before reapprove” semantics (e.g., USDT).
  2. Call `DSwapRepayAdapter.swapAndRepay` with `collateralAsset = USDT` and `maxAmountToSwap` strictly larger than the amount actually needed (any exact-output trade with positive slippage).
  3. Invoke the same flow again; `TransferHelper.safeApprove` attempts to set a fresh allowance while a non-zero remainder exists, USDT’s `approve` reverts, and all DSwap repay/liquidity swaps for that reserve remain unusable until governance manually resets allowances (no function exists).

### [High] Curve exact-output approvals brick buy flows
- Timestamp: 2025-09-28T09:20:58Z
- Location: contracts/lending/periphery/adapters/curve/BaseCurveBuyAdapter.sol:92
- Status: Open
- Details: `_buyOnCurve` approves the Curve router via `SafeERC20.safeApprove` without clearing the existing allowance. Because the helper inflates `amountSold` with a slippage buffer, the router typically consumes less than the approved value and leaves a positive allowance behind. On the next invocation, `SafeERC20` reverts with `approve from non-zero to non-zero allowance`, permanently disabling Curve repay and debt-swap entrypoints (`CurveRepayAdapter.executeOperation`, `.swapAndRepay`, `CurveDebtSwapAdapter._swapAndRepay`) after any positively-slipped trade.
- Reproduction:
  1. Execute a Curve repay through `CurveRepayAdapter.executeOperation` that routes USDT to the debt asset, causing `_buyOnCurve` to approve the router with the slippage buffer.
  2. After the trade, verify `IERC20(USDT).allowance(address(CurveRepayAdapter), address(swapRouter)) > 0` because the router spent less than the allowance.
  3. Repeat the repay; the call reverts at `safeApprove` with `SafeERC20: approve from non-zero to non-zero allowance`, bricking Curve repay/debt swap flows until allowances are zeroed manually.

### [High] Odos exact-output approvals brick zero-reset tokens
- Timestamp: 2025-09-28T08:28:46Z
- Location: contracts/lending/periphery/adapters/odos/OdosSwapUtils.sol:34
- Status: Open
- Details: `OdosSwapUtils.excuteSwapOperation` re-approves the Odos router with `maxIn` without clearing the existing allowance. During exact-output swaps in `OdosDebtSwapAdapter`, positive slippage leaves a residual allowance after the router pulls less than the requested maximum. Tokens that enforce the “zero before reapprove” rule (e.g., USDT) revert on the next `approve`, permanently bricking Odos debt swaps for that asset. The adapters expose no method to reset the allowance, so the issue persists across calls.
- Reproduction:
  1. Pick a reserve whose underlying requires the allowance to be zeroed (e.g., USDT) and call `OdosDebtSwapAdapter.swapDebt` with `newDebtAsset` equal to that token and `maxNewDebtAmount` larger than the amount actually needed (route with positive slippage).
  2. Execute the swap once; `OdosSwapUtils.excuteSwapOperation` approves the router for `maxIn`, the router spends only the needed portion, and the leftover allowance remains > 0.
  3. Invoke any subsequent Odos debt swap for the same reserve. The fresh `approve(router, maxIn)` now reverts with `APPROVE_FAILED`, leaving the adapter unusable for that token until governance resets the allowance out-of-band.

### [High] Odos buy slippage buffer reverts large swaps
- Timestamp: 2025-09-28T08:36:45Z
- Location: contracts/lending/periphery/adapters/odos/BaseOdosBuyAdapter.sol:82
- Status: Open
- Details: `_buyOnOdos` multiplies `maxAmountToSwap` by `(ONE_HUNDRED_PERCENT_BPS + 1) / ONE_HUNDRED_PERCENT_BPS` before calling Odos, then reverts when the buffered amount exceeds the caller-provided `maxAmountToSwap`. Because `ONE_HUNDRED_PERCENT_BPS` equals 1,000,000, any input of at least 1e6 base units (≈ 1e-12 of an 18-decimal token) trips the check, so realistic debt amounts always revert. Odos debt swaps therefore DoS for normal positions.
- Reproduction:
  1. Configure `OdosDebtSwapAdapter.swapDebt` with an 18-decimal reserve and set `maxNewDebtAmount = 1e18` (one token).
  2. Allow the flash loan to proceed until `_buyOnOdos` runs with `maxAmountToSwap = 1e18`.
  3. Observe `_buyOnOdos` revert with `EstimatedAmountExceedsMaximum`, preventing the swap from completing.

### [High] Odos withdraw route strands unswapped collateral
- Timestamp: 2025-09-28T09:01:47Z
- Location: contracts/lending/periphery/adapters/odos/OdosWithdrawSwapAdapter.sol:96 (see also contracts/odos/OdosSwapUtils.sol:34 and contracts/lending/periphery/adapters/odos/BaseOdosSwapAdapter.sol:139)
- Status: Open
- Details: `_pullATokenAndWithdraw` moves the entire `oldAssetAmount` onto the adapter contract, but `_sellOnOdos` forwards caller-supplied `swapData` to `OdosSwapUtils.excuteSwapOperation` and only checks the minimum output. Odos routes can intentionally consume far less than the approved `amountToSwap`, leaving the remainder of the user’s collateral stranded on the adapter where the owner can later sweep it via `rescueTokens`. There is no refund path, so malicious routes or compromised Odos quotes can siphon almost the entire withdrawal.
- Reproduction:
  1. Obtain aTokens for a supported reserve and call `withdrawAndSwap` with `oldAssetAmount = 100` and `minAmountToReceive = 1`.
  2. Provide Odos `swapData` whose `swapTokenInfo.inputAmount` is set to `1`, causing the router to spend only a single unit while still returning enough output to satisfy the check.
  3. After the call, note that the adapter retains the remaining 99 units of the collateral asset; only the owner can recover it through `rescueTokens` while the user is shorted.

### [High] Odos liquidity swap strands leftover collateral
- Timestamp: 2025-09-28T09:27:12Z
- Location: contracts/lending/periphery/adapters/odos/OdosLiquiditySwapAdapter.sol:145 (see also contracts/lending/periphery/adapters/odos/OdosLiquiditySwapAdapter.sol:203 and contracts/odos/OdosSwapUtils.sol:34)
- Status: Open
- Details: `_sellOnOdos` passes `amountToSwap` as the approval cap to `OdosSwapUtils.excuteSwapOperation`, but the Odos router actually spends the `swapTokenInfo.inputAmount` encoded in `swapData`. The adapter never checks how much collateral the router consumed or refunds leftovers. Both the flash-loan and direct liquidity swap paths withdraw the entire `amountToSwap` from the user while any unspent collateral remains on the adapter and can later be reclaimed by the owner via `rescueTokens`, short-changing the user.
- Reproduction:
  1. Acquire aTokens for reserve `R` and build Odos `swapData` with `swapTokenInfo.inputAmount = 1` and low `outputMin`.
  2. Call `OdosLiquiditySwapAdapter.swapAndDeposit` with `amountToSwap = 100` so `_sellOnOdos` approves 100 but the router spends only 1.
  3. After execution, observe the adapter retains ~99 units of `R` while depositing at most 1 unit of the new asset; only the owner can retrieve the stranded collateral via `rescueTokens`.

## Medium
### [Medium] DSwap adapters ignore oracle slippage cap
- Timestamp: 2025-09-28T07:49:26Z
- Location: contracts/lending/periphery/adapters/dswap/BaseDSwapAdapter.sol:49
- Status: Open
- Details: The dSwap base defines `MAX_SLIPPAGE_PERCENT` and exposes `_getPrice`, but `_sellOnDSwap` / `_buyOnDSwap` never consult the oracle or enforce the 5% bound described in Design.md. As a result any call can set `minAmountToReceive`/`amountToReceive` arbitrarily low, so stale routes or compromised keepers can execute swaps far beyond the intended slippage budget, draining user collateral before the flash-loan repayment.

### [Medium] Curve repay/debt swaps trap positive slippage
- Timestamp: 2025-09-28T08:13:18Z
- Location: contracts/lending/periphery/adapters/curve/CurveRepayAdapter.sol:196 (see also contracts/lending/periphery/adapters/curve/CurveDebtSwapAdapter.sol:313)
- Status: Open
- Details: `_buyOnCurve` returns however many debt tokens Curve delivers, but both `CurveRepayAdapter.executeOperation` and `CurveDebtSwapAdapter._swapAndRepay` only forward the requested `debtRepayAmount` to `POOL.repay`. Any surplus produced by positive slippage stays on the adapter, can be reclaimed via `rescueTokens`, and is never credited back to the user supplying collateral. Users therefore lose arbitrarily large excess that should reduce their debt or be returned.

### [Medium] ParaSwap repay traps positive slippage
- Timestamp: 2025-09-28T08:41:16Z
- Location: contracts/lending/periphery/adapters/paraswap/ParaSwapRepayAdapter.sol:170
- Status: Open
- Details: Both `swapAndRepay` and `_swapAndRepay` call `_buyOnParaSwap` and then approve only `debtRepayAmount` to `POOL.repay`. When ParaSwap returns more than the requested amount (positive slippage), the surplus debt tokens remain on the adapter. Borrowers permanently lose the excess while the adapter owner can reclaim it via `rescueTokens`, breaching slippage expectations and leaking funds.
- Reproduction:
  1. Craft `paraswapData` for `swapAndRepay` that routes through a deep stable pair (e.g., DAI/USDC) so the adapter receives `debtRepayAmount + δ`.
  2. Call `swapAndRepay` with collateral covering the trade and `debtRepayAmount` equal to the borrower’s debt.
  3. After the transaction, observe `IERC20(debtAsset).balanceOf(ParaSwapRepayAdapter) = δ > 0` while only `debtRepayAmount` was repaid to the pool; only the owner can recover the surplus via `rescueTokens`.

## Low

## Notes
- Use UTC timestamps when adding entries (ISO 8601).
- Keep reproduction steps concise and actionable.
