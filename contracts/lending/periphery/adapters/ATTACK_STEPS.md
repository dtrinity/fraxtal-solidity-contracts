### Report: Odos Liquidity Swap Adapter Vulnerability (Fraxtal)

**Preconditions**

The Fraxtal attack exploited **three separate victims** with active borrows and different collateral types, all of whom had granted unlimited approvals to the Fraxtal `OdosLiquiditySwapAdapter` at `0x95c0afea3f48d4e3a5fe51b62e8b9f8538b8ff11`:

1. **Victim 1 (dUSD collateral):** `0x48a906fcb66caf68ea3fdd8054309d9f0c268735`
   - Holds `adUSD` (token `0x29d0256fe397f6e442464982c4cba7670646059b`) representing **25,660.569785 dUSD** collateral (25_660_569_785 base units)
   - Had granted unlimited approval on `adUSD` to the adapter

2. **Victim 2 (sfrxETH collateral):** `0xc51fefb9ef83f2d300448b22db6fac032f96df3f`
   - Holds `asfrxETH` (token `0x1f075573e3eb0d7b2d10266ba8c2c2449fa862f7`) representing **9.470347895734879271 sfrxETH** collateral (9_470_347_895_734_879_271 base units)
   - Had granted unlimited approval on `asfrxETH` to the adapter

3. **Victim 3 (sUSDe collateral):** `0xc5f8792685147297f5c11c08a0b3de2a4000b61a`
   - Holds `asUSDe` (token `0x12ed58f0744de71c39118143dcc26977cb99cdef`) representing **7,089.906267115401033920 sUSDe** collateral (7_089_906_267_115_401_033_920 base units)
   - Had granted unlimited approval on `asUSDe` to the adapter

**Atomic Attack Flow (Single Transaction)**

**High-Level Timeline**
1. Flash-mint 40,000 dUSD from the Fraxtal dUSD proxy; the dUSD contract mints straight from the zero address into the attacker executor.
2. Execute **three consecutive** `swapLiquidity` calls (one per victim), each pulling the victim's aTokens, routing the underlying collateral into attacker-controlled conversions, and recycling exactly 1 micro-unit (1e-6) of the original collateral asset back to the adapter as "dust."
3. Settle the indebted victims' outstanding dUSD borrows (Victims 2 & 3) using the flash-minted funds, emitting `Repay` events for each borrower.
4. Repay the flash-mint with 40,000 dUSD, closing the loop with no external liquidity required.

**Why the Multi-Victim Pattern Matters:** Unlike the Sonic attack which targeted a single victim with one collateral type (wstkscUSD), the Fraxtal attack systematically drained **three victims** with **three different collateral assets** (dUSD, sfrxETH, sUSDe) in a single transaction. This demonstrates the attacker's sophistication in maximizing yield from the vulnerability by batching multiple exploits atomically. The same attacker executor address (`0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565`) was used in both Sonic and Fraxtal attacks, indicating a coordinated campaign.

**Why dUSD matters:** The flash-minted dUSD provides the malicious Odos routes with temporary working capital to step through the staging contracts (staging vault → recycler → splitter → micro distributors for each victim), mint the staking wrappers that ultimately rewrap the stolen collateral, **and** fund the `Repay` calls that wipe out the indebted victims' dUSD liabilities (Victims 2 & 3). Without that float, the helper contracts would revert and the adapter would fail to receive even the 1 µ dust needed to satisfy `minOut` for each swap, and those borrowers' debt would remain, preventing the full collateral withdrawals.

**Detailed Attack Steps**

1. **Flash-mint staging:** The attacker contract (`0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565`) calls `dUSD.flashLoan` for **40,000 dUSD** (6 decimals on Fraxtal, so 40,000,000,000 base units). Tenderly shows the paired `Transfer(0x0 -> attacker, 40,000 dUSD)` and later repayment. This is the sole source of dUSD in the transaction; the balance sits on the attacker executor until the final repayment. The minted dUSD acts as working capital for the malicious Odos routes across all three swaps—without it the subsequent wrapper hops would not have the funds to mint the 1-micro collateral returned to the adapter for each victim, and the swaps would revert for insufficient output.

2. **First adapter invocation (Victim 1 - dUSD collateral):** Using the staged funds, the attacker invokes `OdosLiquiditySwapAdapter.swapLiquidity` with:
   - `withFlashLoan = true`
   - `user = 0x48a906fcb66caf68ea3fdd8054309d9f0c268735` (Victim 1)
   - `collateralAsset = newCollateralAsset = dUSD (0x788d96f655735f52c676a133f4dfc53cec614d4a)`
   - `collateralAmountToSwap = 25,660,570,000` (25,660.57 dUSD with 6 decimals)
   - `newCollateralAmount = 0`
   - Attacker-crafted `swapData` that injects their executor as the Odos route leg

3. **Pool flash-loan (Victim 1):** The adapter's flash-loan callback (`executeOperation`) borrows the victim's dUSD collateral from the pool, expecting to sell it for fresh collateral before pulling the victim's aTokens to repay. No victim debt is repaid here—the adapter assumes the borrower provided the required output token and therefore focuses solely on collateral accounting.

4. **Malicious Odos path (Victim 1):** The attacker-supplied Odos route forwards the flash-loaned dUSD into the attacker executor, which:
   - Triggers the pool to burn the victim's `adUSD`, visible as `Transfer(victim -> 0x0)` plus potential matching burn from the reserve manager contract. These burns free the underlying dUSD into attacker-controlled helpers.
   - Pipes the released dUSD through staging contracts and conversion helpers, ultimately crediting the attacker EOA `0x0a69C298ece97fb50a00ace91c79182184423933`.
   - Recycles part of the flash-minted dUSD through staging helpers to mint the staking receipts needed for the 1-micro dUSD dust returned to the adapter.

5. **Dust collateral returned (Victim 1):** To satisfy the adapter's `minOut`, the executor recycles exactly **1 micro-unit (0.000001 dUSD)** back to the adapter, which the adapter dutifully deposits for the victim.

6. **Victim 1 allowance exploited:** The flash-loan branch finalizes by burning the victim's aTokens so the pool's accounting shows the flash borrow repaid. Every redeemed dUSD unit stays on attacker-controlled legs.

7. **Second adapter invocation (Victim 2 - sfrxETH collateral):** The attacker repeats the same pattern with:
   - `user = 0xc51fefb9ef83f2d300448b22db6fac032f96df3f` (Victim 2)
   - `collateralAsset = newCollateralAsset = sfrxETH (0xfc00000000000000000000000000000000000005)`
   - `collateralAmountToSwap = 9,470,000,000,000,000,000` (9.47 sfrxETH with 18 decimals)
   - Same malicious Odos route structure, adapted for sfrxETH conversions

8. **Victim 2 exploitation flow:** The adapter pulls the victim's `asfrxETH`, the malicious route drains the underlying sfrxETH through attacker-controlled conversions, and returns **1 micro-unit (1e-18)** sfrxETH dust to the adapter.

9. **Third adapter invocation (Victim 3 - sUSDe collateral):** The attacker completes the triple-drain with:
   - `user = 0xc5f8792685147297f5c11c08a0b3de2a4000b61a` (Victim 3)
   - `collateralAsset = newCollateralAsset = sUSDe (0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2)`
   - `collateralAmountToSwap = 7,089,910,000,000,000,000,000` (7,089.91 sUSDe with 18 decimals)
   - Same malicious Odos route structure, adapted for sUSDe conversions

10. **Victim 3 exploitation flow:** The adapter pulls the victim's `asUSDe`, the malicious route drains the underlying sUSDe through attacker-controlled conversions, and returns **1 micro-unit (1e-18)** sUSDe dust to the adapter.

11. **Borrower debt repayments:** Before unwinding the flash mint, the executor spends part of the staged dUSD on `Repay` calls against the dUSD reserve. Tenderly shows two concrete repayments executed by the executor (`repayer = 0xDe8558…6565`):
    - **31,176.657789 dUSD** clearing Victim 2's debt (`user = 0xc51f…6df3f`)
    - **6,738.636432 dUSD** clearing Victim 3's debt (`user = 0xc5f8…b61a`)
    - Victim 1 had no outstanding dUSD borrow recorded in the trace, so no `Repay` event fired for `user = 0x48a9…8735`
   Combined, **37,915.294221 dUSD** leaves the executor to zero out the two indebted borrowers while keeping the flash-mint solvent.

12. **Flash-mint repayment:** With the stolen collateral now parked in attacker-controlled wrappers/accounts, the executor returns the exact **40,000 dUSD** it minted in step 1 back to the dUSD proxy (`Transfer(attacker -> 0x0, 40,000 dUSD)`). No additional dUSD is sourced—the repayment uses the same flash-minted funds that originated from the zero address, leaving the attacker with the collateral while the flash-mint closes flat.

**Result:** Three victims' collateral (dUSD, sfrxETH, sUSDe) is replaced with negligible 1-micro-unit deposits. The attacker path accumulates approximately:
- **25,660.569785 dUSD** (Victim 1 collateralPulled)
- **9.470347895734879271 sfrxETH** (Victim 2 collateralPulled)
- **7,089.906267115401033920 sUSDe** (Victim 3 collateralPulled)

Total stolen value: **~$42,000-$43,000 USD** across all three collateral types, before walking through conversion wrappers and delivering to the attacker EOA. The flash-minted dUSD is also used to repay the victims' outstanding dUSD borrows (~37,902.15 dUSD according to the flash-mint delta), so the attacker walks away with the collateral windfall while the victims are left debt-free but destitute of collateral.

---

### Concrete Indicators / IOCs

* **Transaction Hash (Fraxtal):** `0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32`
* **Attacker EOA:** `0x0a69C298ece97fb50a00ace91c79182184423933` (same EOA as Sonic attack)
* **Attacker Executor / Router:** `0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565` (same executor as Sonic attack)
* **Adapter (vulnerable):** `0x95c0afea3f48d4e3a5fe51b62e8b9f8538b8ff11`
* **dLEND Pool:** `0xd76c827ee2ce1e37c37fc2ce91376812d3c9bce2`

**Victims:**
1. **Victim 1 (dUSD):** `0x48a906fcb66caf68ea3fdd8054309d9f0c268735`
   - **Collateral Drained:** 25,660.569785 dUSD (6 decimals)
   - **aToken:** `adUSD` at `0x29d0256fe397f6e442464982c4cba7670646059b`

2. **Victim 2 (sfrxETH):** `0xc51fefb9ef83f2d300448b22db6fac032f96df3f`
   - **Collateral Drained:** 9.470347895734879271 sfrxETH (18 decimals)
   - **aToken:** `asfrxETH` at `0x1f075573e3eb0d7b2d10266ba8c2c2449fa862f7`

3. **Victim 3 (sUSDe):** `0xc5f8792685147297f5c11c08a0b3de2a4000b61a`
   - **Collateral Drained:** 7,089.906267115401033920 sUSDe (18 decimals)
   - **aToken:** `asUSDe` at `0x12ed58f0744de71c39118143dcc26977cb99cdef`

**Flash-Mint Evidence:**
* `dUSD` transfers `0x0 -> attacker` and `attacker -> 0x0` of **40,000 dUSD** bracket the exploit, proving reliance on the Fraxtal dUSD flash-loan facility.
* Net debt repayment: **~37,902.15 dUSD** used to settle victims' borrows before closing the flash mint.

**Attack Signature:**
* **Three consecutive** `swapLiquidity` calls in a single transaction
* Each call returns exactly **1 micro-unit** (1e-6 for dUSD, 1e-18 for sfrxETH/sUSDe) of the collateral asset
* Each call exploits a different victim with a different collateral type
* Same attacker infrastructure as Sonic attack (EOA + executor addresses)

---

### Reference Address Book (Fraxtal tx `0xd8ae...4a32`)

**Core Attack Infrastructure**
* Attacker EOA (final recipient): `0x0a69C298ece97fb50a00ace91c79182184423933`
* Attacker executor/router: `0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565`
* Vulnerable adapter (OdosLiquiditySwapAdapter): `0x95c0afea3f48d4e3a5fe51b62e8b9f8538b8ff11`
* dLEND Pool: `0xd76c827ee2ce1e37c37fc2ce91376812d3c9bce2`

**Victim 1 - dUSD Collateral**
* Victim wallet: `0x48a906fcb66caf68ea3fdd8054309d9f0c268735`
* aToken drained (`adUSD`): `0x29d0256fe397f6e442464982c4cba7670646059b`
* Underlying collateral (`dUSD`): `0x788d96f655735f52c676a133f4dfc53cec614d4a` (6 decimals)
* Amount stolen: 25,660.57 dUSD

**Victim 2 - sfrxETH Collateral**
* Victim wallet: `0xc51fefb9ef83f2d300448b22db6fac032f96df3f`
* aToken drained (`asfrxETH`): `0x1f075573e3eb0d7b2d10266ba8c2c2449fa862f7`
* Underlying collateral (`sfrxETH`): `0xfc00000000000000000000000000000000000005` (18 decimals)
* Amount stolen: 9.47 sfrxETH

**Victim 3 - sUSDe Collateral**
* Victim wallet: `0xc5f8792685147297f5c11c08a0b3de2a4000b61a`
* aToken drained (`asUSDe`): `0x12ed58f0744de71c39118143dcc26977cb99cdef`
* Underlying collateral (`sUSDe`): `0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2` (18 decimals)
* Amount stolen: 7,089.91 sUSDe

**Flash-mint / Routing Helpers**
* dUSD proxy / ERC20 (flash-mint + flash-loan target): `0x788d96f655735f52c676a133f4dfc53cec614d4a` (delegatecalls into implementation `0xaf2d757bfbded5f84f71d28223acda06352fddb6`)
* dLEND pool (flash-loan provider & debt accounting): `0xd76c827ee2ce1e37c37fc2ce91376812d3c9bce2`
* Attacker executor / router hub: `0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565`
* Odos staging counterparts visible in approvals: `0x56c85a254dd12ee8d9c04049a4ab62769ce98210` (route spender) and `0x8b4e5263e8d6cc0bbf31edf14491fc6077b88229` (splitter)
* Additional staging vaults and recycler legs can be cross-referenced directly in `reports/tenderly/raw-tenderly-trace-fraxtal-d8ae4f2a.json`

**Token Metadata Summary**
* `dUSD` decimals: 6 (Fraxtal-specific, differs from Sonic's 18 decimals)
* `sfrxETH` decimals: 18
* `sUSDe` decimals: 18
* All aTokens inherit their underlying token's decimals

**Tenderly Trace Checkpoints**
1. `flashLoan` call on `dUSD` (delegatecall into proxy) with `_amount = 40,000 * 1e6` (note: 6 decimals on Fraxtal)
2. First adapter `swapLiquidity` call with `user = 0x48a9...8735`, `collateralAsset = dUSD`, `collateralAmountToSwap = 25,660,570,000`
3. `Transfer` of `adUSD` from Victim 1 to zero address (burn) followed by `Transfer` of `dUSD` from helpers to attacker executor
4. Dust return `Transfer` of `1` dUSD (1e-6) from attacker executor back to adapter
5. Second adapter `swapLiquidity` call with `user = 0xc51f...6df3f`, `collateralAsset = sfrxETH`, `collateralAmountToSwap = 9,470,000,000,000,000,000`
6. `Transfer` of `asfrxETH` from Victim 2 to zero address (burn) followed by conversions and dust return of `1` sfrxETH (1e-18)
7. Third adapter `swapLiquidity` call with `user = 0xc5f8...b61a`, `collateralAsset = sUSDe`, `collateralAmountToSwap = 7,089,910,000,000,000,000,000`
8. `Transfer` of `asUSDe` from Victim 3 to zero address (burn) followed by conversions and dust return of `1` sUSDe (1e-18)
9. Multiple `Repay` events covering 37,915.294221 dUSD total debt settlement (Victims 2 & 3 only)
10. Flash-loan repayment `Transfer(attacker -> 0x0, 40,000 dUSD)`

Cached artefacts should live under `reports/tenderly/` once trace analysis is complete; rerun trace extraction scripts with `TENDERLY_FORCE_REFRESH=true` if trace data needs a refresh.

---

### Root Causes (Concise)

1. **Untrusted `user` parameter:** The adapter lets arbitrary callers set `user`, then performs `transferFrom(user, adapter, amount)` against pre-existing approvals. No runtime authentication or permit check protects the victims.
2. **No value sanity checks:** The adapter trusts caller-supplied `swapData`/`minOut`, so a malicious Odos path can siphon the withdrawn collateral while returning dust (as little as 1e-6 or 1e-18 units).
3. **Flash-liquidity amplification:** Fraxtal's dUSD flash-loan + the adapter's `withFlashLoan` branch give the attacker enough intra-tx liquidity to mask the drain across **three victims** and repay obligations without capital.
4. **Multi-victim batching capability:** The atomic transaction design allows the attacker to systematically drain multiple victims with different collateral types in a single coordinated attack, maximizing extraction efficiency.

---

### Confidence Notes (Confirmed vs. Speculative)

* **Confirmed:** Transaction hash `0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32` shows the attack on Fraxtal block explorer.
* **Confirmed:** Same attacker EOA (`0x0a69C298ece97fb50a00ace91c79182184423933`) and executor (`0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565`) as Sonic attack, proving coordinated campaign.
* **Confirmed:** Three separate `swapLiquidity` calls visible in transaction trace, each targeting a different victim.
* **Confirmed:** Flash-mint amount of 40,000 dUSD and approximate stolen amounts based on transaction analysis.
* **Confirmed:** Vulnerable adapter address (`0x95c0afea3f48d4e3a5fe51b62e8b9f8538b8ff11`) and dLEND pool address (`0xd76c827ee2ce1e37c37fc2ce91376812d3c9bce2`).
* **Pending Tenderly trace:** Exact routing through staging vaults, recyclers, and conversion helpers awaits detailed Tenderly trace analysis. The attack flow structure mirrors Sonic, but specific helper contract addresses on Fraxtal need to be extracted from the trace.
* **Confirmed:** Two `Repay` events drained **31,176.657789 dUSD** (Victim 2) and **6,738.636432 dUSD** (Victim 3), zeroing their debt while Victim 1 showed no outstanding borrow in the trace.

---

### Key Differences from Sonic Attack

1. **Multi-victim, multi-collateral:** Fraxtal attack exploited **3 victims** with **3 different collateral types** (dUSD, sfrxETH, sUSDe) vs. Sonic's single victim with wstkscUSD.
2. **Token decimals:** Fraxtal dUSD uses **6 decimals** vs. Sonic dUSD's 18 decimals, affecting flash-mint amounts and dust calculations.
3. **Attack magnitude:** Total stolen ~$42k-$43k across three assets vs. Sonic's ~$35k from single asset.
4. **Atomic batching:** Three consecutive `swapLiquidity` calls in one transaction demonstrates systematic exploitation pattern.
5. **Same attacker infrastructure:** Identical EOA and executor addresses prove this is a coordinated multi-chain attack campaign.

This attack represents a more sophisticated exploitation of the same vulnerability, demonstrating that the attacker understood the adapter flaw deeply enough to maximize extraction across multiple victims and collateral types in a single atomic transaction.
