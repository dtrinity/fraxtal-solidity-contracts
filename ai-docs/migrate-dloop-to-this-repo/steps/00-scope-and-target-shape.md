## Step 00 — Scope + target shape (Sonic → Fraxtal)

### Objective

Decide (and document) exactly what “dLOOP migrated into Fraxtal” means, given Fraxtal already has partial dLOOP code.

This step is primarily **decision + documentation**; do not start large code moves until Step 01.

### Inputs

- **Sonic canonical module**:
  - `sonic-solidity-contracts-2/contracts/vaults/dloop/**`
  - `sonic-solidity-contracts-2/deploy/12_dloop/**`
  - `sonic-solidity-contracts-2/test/dloop/**`
- **Fraxtal current state**:
  - Contracts: `fraxtal-solidity-contracts/contracts/vaults/dLOOP/**` (partial)
  - Deploy scripts: `fraxtal-solidity-contracts/deploy/19_dloop/**` (core + periphery for UniswapV3/Curve/Odos)
  - Config typing: `fraxtal-solidity-contracts/config/types.ts` includes `dLoop: DLoopConfig`

### Decision checklist (write answers in this file before proceeding)

#### 1) Folder / import root decision

Sonic uses `contracts/vaults/dloop/**`. Fraxtal currently uses `contracts/vaults/dLOOP/**`.

- **Recommended for lowest churn**: keep Fraxtal’s existing path (`contracts/vaults/dLOOP/**`) and map Sonic files into it.
- **Optional cleanup later**: move to `contracts/vaults/dloop/**` only after parity is achieved, because it forces import-path churn across deploy scripts and tests.

Decision:

- [x] Keep `contracts/vaults/dLOOP/**` as the canonical path in Fraxtal for now
- [ ] Or migrate to `contracts/vaults/dloop/**` immediately (expect bigger refactor)

#### 2) Feature parity decision (what must be ported)

Minimum set to be considered “Sonic dLOOP migrated”:

- **Core**:
  - `DLoopCoreBase.sol`
  - `DLoopCoreLogic.sol` (library)
  - `DLoopQuoter.sol`
  - `venue/dlend/**` (DLend adapter + interfaces)
  - `venue/mock/**` (Core mocks used by tests)
- **Periphery**:
  - `DLoopDepositorBase.sol`
  - `DLoopRedeemerBase.sol`
  - `DLoopIncreaseLeverageBase.sol`
  - `DLoopDecreaseLeverageBase.sol`
  - `venue/odos/**` (Odos swap logic + periphery contracts)
  - `venue/mock/**` (periphery mocks used by tests)
- **Shared**:
  - `shared/RescuableVault.sol` (or equivalent) required by Sonic imports/tests
- **Deploy scripts**:
  - core logic deploy + linking
  - core DLend deploy
  - quoter deploy
  - Odos swap logic deploy + periphery deploys (depositor/redeemer/increase/decrease)
- **Tests**:
  - Tier A (unit + mock) tests ported and passing

Decision:

- [x] Full parity with Sonic module (recommended)
- [ ] Subset parity (must list exactly what is excluded and why)

#### 3) How to reconcile Fraxtal “withdrawer” naming vs Sonic “redeemer”

Fraxtal currently has `DLoopWithdrawerBase` and `DLoopWithdrawer*` venues.
Sonic has `DLoopRedeemerBase` and `DLoopRedeemer*` venues.

Pick one strategy:

- **Strategy A (recommended)**: port Sonic names as canonical and keep “withdrawer” as an alias/wrapper if needed.
  - Pros: easiest to port Sonic tests/scripts with minimal churn.
  - Cons: may require small adjustments to existing Fraxtal deploy scripts referencing withdrawer.
- **Strategy B**: rename Sonic “redeemer” → “withdrawer” everywhere (bigger churn in Sonic test port).
- **Strategy C**: keep both (avoid unless you have a strong reason; doubles maintenance).

Decision:

- [x] Strategy A
- [ ] Strategy B
- [ ] Strategy C

#### 4) Network-agnostic config policy (repo-level)

Fraxtal’s current `config/config.ts` uses a hardcoded network allowlist.
For “network-agnostic” migration, we will implement:

- an env-var config path override, and/or
- a dynamic `config/networks/<network>.ts` loader fallback

Decision:

- [ ] Implement env-var path loader (recommended)
- [ ] Implement dynamic `config/networks/<network>.ts` loader (recommended)
- [x] Implement both

### Acceptance criteria (Step 00 is complete when…)

- A written decision exists for each section above.
- `steps/progress.md` is updated: Step 00 marked complete, session log filled.
