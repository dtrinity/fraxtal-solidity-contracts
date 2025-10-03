# dLEND Swap Adapter Design Overview

## 1. Scope and Intent

The dLEND swap adapter suite links dLEND's money-market core (an Aave v3–fork) with external liquidity venues so that users or automation bots can rebalance collateral, repay debt, or unwind positions without leaving the protocol. Each adapter wraps a specific third-party router while enforcing dLEND risk controls around flash loans, collateral accounting, and slippage. The current deployment targets four venue families:

- **dSwap**: Native dTrinity router optimised for Fraxtal.
- **Curve**: Stableswap-style pools for deep stablecoin or correlated asset liquidity.
- **Odos**: Meta-routing aggregator for fragmented on-chain liquidity.
- **ParaSwap**: Aggregator for multi-hop, multi-DEX routes.

Every adapter exposes one or more of three core user flows:

1. **Liquidity swap** – exchange an existing collateral asset for a different collateral asset and deposit it back into dLEND (flash-loan assisted or direct).
2. **Collateral repay** – sell collateral to repay debt (flash-loan assisted or direct) while preserving borrower health factor.
3. **Withdraw and swap** – unwind collateral into a target asset and transfer it to the user (no flash loan).

## 2. Contract Catalogue

### 2.1 Shared base layers

| Contract | Location | Purpose |
| --- | --- | --- |
| `FlashLoanSimpleReceiverBase` | `contracts/lending/core/flashloan/base/` | Supplies flash-loan lifecycle hooks (`executeOperation`) used by liquidity and repay flows.
| `GPv2SafeERC20`, `SafeERC20`, `SafeMath`, `PercentageMath` | `contracts/lending/core/dependencies` | Arithmetic and token safety helpers reused across adapters.
| `ReentrancyGuard` | `contracts/lending/periphery/dependencies/openzeppelin/` | Used by state-changing entrypoints to block re-entrancy.
| `IPoolAddressesProvider`, `IPool`, `DataTypes` | `contracts/lending/core/interfaces/` | Canonical dLEND core interfaces for pool access, reserve metadata, and debt tokens.

### 2.2 Adapter families

#### dSwap (`contracts/lending/periphery/adapters/dswap`)

- `BaseDSwapAdapter`: Flash-loan capable base with oracle access and permit-aware aToken withdrawal helpers.
- `BaseDSwapSellAdapter` / `BaseDSwapBuyAdapter`: Thin wrappers that call the `ISwapRouter` router using exact-input or exact-output paths and emit `Swapped` / `Bought` events.
- `DSwapLiquiditySwapAdapter`: Handles collateral-to-collateral swaps; supports flash loans via `executeOperation` as well as `swapAndDeposit` without flash loans.
- `DSwapRepayAdapter`: Converts collateral into debt asset and repays outstanding borrow; supports flash-loan-assisted `executeOperation` and manual `swapAndRepay`.
- `DSwapWithdrawSwapAdapter`: Withdraws collateral and swaps into a target asset before transferring to the caller; exposes `withdrawAndSwap` only (flash loans not supported).
- Support files: `TransferHelper`, `interfaces/ISwapRouter.sol` mirror Uniswap-style router behaviour for safe approvals and path encoding.

#### Curve (`contracts/lending/periphery/adapters/curve`)

- `BaseCurveSwapAdapter`: Non–flash-loan base that stores `ADDRESSES_PROVIDER` and `POOL`, unwraps aTokens via permit, and maintains allowances for the Curve pool.
- `BaseCurveSellAdapter` / `BaseCurveBuyAdapter`: Implement slippage-checked swaps against Curve routers.
- `CurveLiquiditySwapAdapter`, `CurveRepayAdapter`, `CurveDebtSwapAdapter`, `CurveWithdrawSwapAdapter`: Each mirrors the dSwap adapter surface but routes trades through Curve pool abstractions defined in `interfaces/` (e.g., `ICurveStableSwap`, `ICurveRouter`).

#### Odos (`contracts/lending/periphery/adapters/odos`)

- `BaseOdosSwapAdapter`: Ownable base with references to `IPoolAddressesProvider` and `IPool`, plus permit-aware aToken withdrawal.
- `BaseOdosSellAdapter` / `BaseOdosBuyAdapter`: Wrap calls to the Odos router (`IOdosRouterV2`) using pre-built route data supplied off-chain.
- `OdosLiquiditySwapAdapter`, `OdosDebtSwapAdapter`, `OdosWithdrawSwapAdapter`: Implement the three flows by orchestrating Odos swaps and dLEND deposits/repayments; `OdosRepayAdapter` additionally validates flash-loan invariants like `InsufficientOutputAmount`.

#### ParaSwap (`contracts/lending/periphery/adapters/paraswap`)

- `BaseParaSwapAdapter`: Flash-loan-capable base with oracle price helpers (`IPriceOracleGetter`) and permit support, plus conservative 30% `MAX_SLIPPAGE_PERCENT` guard.
- `BaseParaSwapSellAdapter` / `BaseParaSwapBuyAdapter`: Encode ParaSwap Augustus calldata and orchestrate min/max output checks.
- `ParaSwapLiquiditySwapAdapter`, `ParaSwapRepayAdapter`, `ParaSwapWithdrawSwapAdapter`: Mirror dSwap flows but target ParaSwap's Augustus router (`IParaSwapAugustus*` interfaces) and track referral codes for fee rebates.

## 3. dLEND Integration Points

- **Addresses provider (`IPoolAddressesProvider`)** – supplies canonical pool, oracle, ACL manager, and treasury addresses. All adapters read pool/oracle references exclusively from the provider to keep configuration centralised.
- **Pool interaction (`IPool`)** – adapters call `deposit`, `withdraw`, `repay`, and `flashLoanSimple` (via base class) to modify user positions. Flash-loan callbacks enforce `msg.sender == address(POOL)` to prevent spoofing.
- **aToken and debt token handling** – `_getReserveData` resolves the aToken, stable debt token, and variable debt token for each reserve. Permit-capable aTokens (`IERC20WithPermit`) let users authorise spends without ERC20 approvals.
- **Oracle usage** – dSwap and ParaSwap bases consult dLEND's price oracle to derive implicit maximum slippage and convert ETH-denominated limits where needed.
- **Access control** – All adapters inherit OpenZeppelin `Ownable`. Ownership is expected to point to protocol governance; `rescueTokens` is the only owner-only action.

## 4. Core Execution Flows

### 4.1 Liquidity swap (collateral → new collateral)

1. Caller prepares aggregator-specific calldata plus optional permit signature.
2. Adapter pulls the caller's aTokens (permit or allowance) and withdraws underlying collateral.
3. For flash-loan variants, the adapter first borrows `assetToSwapFrom` from `POOL` before performing step 2, using the flash liquidity to front-run the user's withdrawal.
4. Swap router executes the trade path (dSwap, Curve, Odos, or ParaSwap) with min-output protection.
5. Adapter approves the dLEND pool for the received asset and calls `POOL.deposit(newAsset, amountReceived, onBehalfOf, 0)`.
6. Flash-loan flows repay the principal plus premium from the swapped funds; direct flows simply leave the deposited position in place.

### 4.2 Collateral repay (collateral → debt asset)

1. User supplies route data for the desired aggregator and, optionally, a permit covering their collateral aTokens.
2. Adapter computes the debt amount to repay. If `buyAllBalanceOffset` is set, it queries `POOL.getUserAccountData` / debt tokens to determine outstanding principal.
3. Adapter withdraws the specified collateral amount and performs an exact-output trade targeting the debt amount.
4. Any excess collateral is redeposited on behalf of the user.
5. Debt asset allowance is refreshed (`approve(0)` then `approve(amount)`) and `POOL.repay` is invoked with the selected rate mode.
6. Flash-loan flows repay the loan using the debt asset that was just acquired.

### 4.3 Withdraw and swap (collateral → external asset)

1. Caller authorises the adapter to pull the chosen collateral aToken balance (optionally all via `swapAllBalanceOffset`).
2. Adapter withdraws the underlying asset from dLEND and performs an exact-input swap into the requested asset.
3. Proceeds are transferred directly to the caller; no pool deposit occurs.
4. These entrypoints run under `nonReentrant` guards and do not leverage flash loans.

## 5. External Dependencies & Data Inputs

- **dSwap `ISwapRouter`** – expects Uniswap V3–style `exactInput`/`exactOutput` methods and path encoding; helper `TransferHelper` manages approvals.
- **Curve router interfaces** – adapters rely on pool-specific ABI fragments (`ICurvePool`, `ICurveRouter`) for exchanging tokens; governance must ensure correct pool IDs and indices are configured.
- **Odos router (`IOdosRouterV2`)** – uses route responses constructed off-chain; adapters treat calldata as opaque bytes but enforce `SwapFailed` and min-output checks.
- **ParaSwap Augustus** – integrates through generated interfaces; calldata typically produced by ParaSwap's API.
- **Permit signatures** – all flows accept EIP-2612 permits for aTokens to remove the need for prior approvals. Incorrect permit parameters cause `permit` to revert before any state change.
- **Slippage parameters** – user-supplied values (`minAmountToReceive`, `amountToReceive`) are trusted; bases cap maximum tolerated slippage (`MAX_SLIPPAGE_PERCENT`) where applicable.

## 6. Safeguards & Observability

- **Reentrancy** – state-changing entrypoints are protected by `ReentrancyGuard` except for flash-loan callbacks, which rely on the pool's callback discipline.
- **Allowances** – adapters zero-out ERC20 allowances before resetting them to mitigate non-standard token approvals.
- **Events** – all swap adapters emit `Swapped`, `Bought`, or more specific domain events (e.g., `Repay` events inside aggregator-specific contracts) to aid off-chain monitoring.
- **Oracle-derived sanity** – when present, price feeds from dLEND's oracle prevent executing swaps that would exceed protocol-defined slippage caps.
- **Error surfaces** – custom errors such as `InsufficientOutput`, `CallerMustBePool`, or `InitiatorMustBeThis` are thrown to catch aggregator misexecution early. Auditors should verify each revert condition remains reachable.

## 7. Configuration & Governance Touchpoints

- Adapter constructor arguments bind the contract to a specific pool, router, and owner. Governance-controlled deployment scripts (see `deploy/03_lending/03_periphery_post/`) instantiate the adapters with vetted router addresses.
- Ownership should transfer to protocol governance. Owners can call `rescueTokens` to recover dust left in the adapter, but no other privileged mutators exist.
- Router-specific parameters (e.g., Curve pool IDs, Odos route calldata, ParaSwap Augustus payloads) are provided at call time by the user or automation layer; adapters do not store mutable configuration beyond constructor state.

## 8. Testing & Monitoring Considerations

- Unit tests under `test/dlend/swap-adapters/` cover happy-path swaps, flash-loan repayments, and slippage edge cases for dSwap. Equivalent coverage for other aggregator families should be reviewed or expanded.
- Off-chain bots orchestrating these flows must monitor on-chain prices to avoid stale routes that would breach slippage.
- Observability pipelines should alert on `Swapped` / `Bought` events with unexpectedly low output or frequent `SwapFailed` reverts, as these can indicate router downtime or misconfiguration.

## 9. Assumptions & Open Questions

- dLEND pool and address provider contracts follow the Aave v3 API exactly; deviations may break reserve lookups or flash-loan callbacks.
- Router interfaces are assumed to be trustworthy and to honour ERC20 transfer semantics. Adapters perform no authentication of router calldata beyond contract address.
- Oracle price feeds remain accurate; significant drift would undermine slippage guards.
- Auditors should confirm that governance, deployment scripts, and operational runbooks ensure only approved routers are whitelisted when adapters are deployed.
