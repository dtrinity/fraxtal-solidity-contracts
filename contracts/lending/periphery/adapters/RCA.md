# Root Cause Analysis: Odos Liquidity Swap Adapter Exploit (Fraxtal)
## dTRINITY Protocol — Fraxtal Network

*Prepared: October 1, 2025*
*Classification: Critical Security Incident*
*Affected Component: OdosLiquiditySwapAdapter v1 (Fraxtal deployment)*

---

## Executive Summary

On Fraxtal mainnet, transaction `0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32` drained three collateral positions in a single atomic call to the Odos Liquidity Swap Adapter. The attacker abused two design flaws carried over from Sonic:

1. **Missing caller authentication** — the adapter did not enforce `msg.sender == user`, allowing any address with approvals to act on behalf of victims.
2. **No minimum output guard** — the malicious route returned only dust (1 unit) while retaining the victim’s entire collateral.

The exploit flash-minted 40,000 dUSD, hijacked approvals across three victims (dUSD, sfrxETH, sUSDe), repaid all outstanding debt, and transferred the seized collateral to attacker-controlled addresses. Total estimated loss ≈ **$42.5k** at the time of the incident.

---

## Impact Assessment

| Victim | Asset | Collateral Pulled (Tenderly) | Dust Returned | Net Loss |
| --- | --- | --- | --- | --- |
| `0x48a906fcb66caf68ea3fdd8054309d9f0c268735` | dUSD | 25,660.569785 dUSD | 0.000001 dUSD | 25,660.569784 dUSD |
| `0xc51fefb9ef83f2d300448b22db6fac032f96df3f` | sfrxETH | 9.470347895734879271 sfrxETH | 1 wei | 9.470347895734879270 sfrxETH |
| `0xc5f8792685147297f5c11c08a0b3de2a4000b61a` | sUSDe | 7,089.906267115401033920 sUSDe | 1 wei | 7,089.906267115401033919 sUSDe |

*Attacker cluster:* EOA `0x0a69C298ece97fb50a00ace91c79182184423933`, executor `0xDe8558c9111FD58C8Db74c6c01D29Bb9e5836565`, Odos splitter `0x8b4e5263e8d6cc0bbf31edf14491fc6077b88229`.

*Flash Mint:* 40,000 dUSD (burned within transaction).

*Debt Forgiven:* 37,915.294221 dUSD repaid on-chain (31,176.657789 for Victim 2, 6,738.636432 for Victim 3; Victim 1 carried no debt).

---

## Technical Analysis

### Vulnerability

The Fraxtal adapter mirrored the Sonic implementation and lacked a caller check:

```solidity
function swapLiquidity(
    LiquiditySwapParams memory liquiditySwapParams,
    PermitInput memory collateralATokenPermit
) external nonReentrant {
    // Missing: require(msg.sender == liquiditySwapParams.user)
    if (!liquiditySwapParams.withFlashLoan) {
        _swapAndDeposit(liquiditySwapParams, collateralATokenPermit);
    } else {
        _flash(liquiditySwapParams, collateralATokenPermit);
    }
}
```

Because users pre-approved the adapter to move their aTokens, the attacker could:
- Set `liquiditySwapParams.user` to the victim address.
- Trigger `safeTransferFrom(user, adapter, amount)` inside `_pullATokenAndWithdraw`.
- Route the withdrawn collateral through a malicious Odos route that returned only 1 unit of dust.

### Attack Flow (per victim)

1. Flash mint 40,000 dUSD to fund helper contracts.
2. For each victim:
   - Invoke `swapLiquidity` with `withFlashLoan = true`.
   - Adapter flash-borrows collateral from the pool and calls the malicious router.
   - Router transfers **all** collateral to the attacker-controlled executor, then returns **1 unit of dust** back to the adapter so balance checks pass.
   - Adapter pulls the victim’s aTokens (thanks to prior approvals) and repays the flash loan.
3. After processing all three victims, the executor funnels the stolen collateral to the attacker beneficiary and repays the flash-mint.

### Reproduction & Parity

- Vulnerable harness (`LegacyOdosLiquiditySwapAdapter`) reproduces the full exploit with Tenderly-aligned traces (100% match). See `test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts`.
- Tenderly artefacts (production vs repro) stored under `reports/tenderly/`:
  - Raw trace: `raw-tenderly-trace-fraxtal-d8ae4f2a.json`
  - Comparison: `attack-vs-repro-comparison-fraxtal.json`
- Summary output (local harness) captures stolen amounts and attacker gains for RCA charts.

---

## Incident Timeline

| Time (UTC) | Event |
| --- | --- |
| **2025-09-27 22:15:25** (Fraxtal block `26,100,307`) | Attack transaction `0xd8ae…4a32` executed; three victims drained in one atomic call. Timestamp sourced from Fraxtal RPC (`eth_getBlockByNumber`). |
| **~22:20** | Cross-chain anomaly monitor flagged the reused Sonic attacker cluster (EOA `0x0a69…9333`, executor `0xDe85…6565`), paging the security on-call engineer. |
| **2025-09-28** | Incident channel opened; approvals to the Fraxtal Odos adapter were frozen while impact was confirmed and victims were notified. |
| **2025-09-30** | Repository patch adding the `UnauthorizedUser` guard landed on the Fraxtal branch; mitigation regression test enabled. |
| **2025-10-01** | Multi-victim reproduction harness validated (all exploit specs green, Tenderly comparison at 100%); RCA drafting initiated. |

---

## Detection & Monitoring

- **What triggered detection:** Shared attacker infrastructure with the Sonic incident. The same EOA and executor address tripped the cross-chain adapter monitor less than five minutes after execution.
- **Signals observed:**
  - `swapLiquidity` calls where `msg.sender` (`0xDe85…6565`) differed from the `user` parameter.
  - Identical dust-return footprint (1e-6 / 1e-18) across three consecutive swaps in a single transaction.
  - Flash-mint of 40,000 dUSD followed by two large `Repay` events (Victims 2 & 3).
- **Recommended monitors going forward:**
  1. Alert on adapter calls with `msg.sender != user` once legacy harness is retired.
  2. Track swap output ratios; raise high-severity alerts when effective output/input < 0.01%.
  3. Correlate any future use of executor `0xDe85…6565` or splitter `0x8b4e…8229` on supported networks.
- **Data artefacts:** Tenderly comparison JSON (`reports/tenderly/attack-vs-repro-comparison-fraxtal.json`) enumerates every victim’s `collateralPulled`, `dustReturned`, and confirms the two `Repay` events.

---

## Root Cause

- **Primary:** Missing authentication check allowed arbitrary callers to impersonate victims when invoking `swapLiquidity`.
- **Secondary:** Lack of a minimum-output guard permitted same-asset swaps that returned negligible dust.

The vulnerability is identical to the previously analysed Sonic incident; the Fraxtal deployment inherited the same adapter without the Sonic patch.

---

## Mitigation

1. **Caller Authentication:** Added `UnauthorizedUser` guard (`require(msg.sender == liquiditySwapParams.user)`) to the Fraxtal adapter source (`contracts/lending/periphery/adapters/odos/OdosLiquiditySwapAdapter.sol`). On-chain redeploy is queued alongside release `fraxtal-adapter-hotfix-1` once partner testing completes.
2. **Regression Tests:** Un-skipped mitigation test verifies the exploit now reverts (`OdosLiquiditySwapAdapter.exploit.test.ts` → “should revert when mitigation enforces msg.sender == user”).
3. **Legacy Harness:** Introduced `LegacyOdosLiquiditySwapAdapter` for controlled reproduction without affecting the patched contract.

Future hardening (recommended): enforce minimum swap output thresholds and integrate victim-consented permits rather than persistent approvals.

---

## Lessons Learned

1. **Authentication is mandatory on adapter entry points.** Shared-approval designs magnify the blast radius of any missing guard.
2. **Dust-level `minOut` values are an anti-pattern.** Output sanity checks (oracle-backed or victim-supplied) must gate swaps before aToken burns execute.
3. **Cross-chain attacker reuse is a rich detection vector.** The Sonic compromise provided the indicators we needed to catch the Fraxtal follow-up quickly.
4. **Keep exploit harnesses decoupled from production code.** Maintaining a legacy adapter copy let us validate mitigation without reopening the hole.

---

## Verification

- `yarn hardhat test test/lending/adapters/odos/v1/OdosLiquiditySwapAdapter.exploit.test.ts`
  - 4 exploit diagnostics passing against the legacy adapter
  - 1 mitigation assertion passing against the patched adapter
- `npx hardhat run scripts/tenderly/compare-odos-attack-events.ts`
  - 100% alignment between production trace and local reproduction

---

## Action Items

| Item | Owner | Status |
| --- | --- | --- |
| Publish Fraxtal mitigation (require `msg.sender == user`) | Protocol Engineering | ✅ merged (redeploy pending) |
| Implement minimum output guard / sanity checks | Protocol Engineering | ☐ todo |
| Draft and circulate incident communication (Fraxtal) | Comms | ☐ todo |
| Complete RCA timeline & detection narrative | Security | ✅ done |
| Redeploy patched adapter + migrate approvals | Protocol Engineering | ☐ scheduled |
| Remove `LegacyOdosLiquiditySwapAdapter` once comms close | Protocol Engineering | ☐ todo |

---

## References

- Tenderly dashboard: https://dashboard.tenderly.co/tx/fraxtal/0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32
- Local reproduction summary: console output from `OdosLiquiditySwapAdapter.exploit.test.ts`
- Harness config: `contracts/testing/odos/LegacyOdosLiquiditySwapAdapter.sol`
- Mitigation test: `should revert when mitigation enforces msg.sender == user`
