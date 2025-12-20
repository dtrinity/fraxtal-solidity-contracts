# Migration Plan: migrate Sonic `dLOOP` into `fraxtal-solidity-contracts`

This document is written for an implementation agent (e.g. **GPT-5.1 Codex-mini**) to execute **incrementally**.

It is intentionally **network-agnostic**:

- **No chain-specific addresses** may be hardcoded inside Solidity contracts or deploy scripts.
- Any chain-specific data must live in **config** (loaded at runtime), with a workflow that supports adding **new networks without editing a giant switch statement**.

Sonic repo is located at [sonic-solidity-contracts-2](/Users/dinosaurchi/Desktop/Project/stably-prime/trinity/sonic-solidity-contracts-2).

Fraxtal repo is located at [fraxtal-solidity-contracts](/Users/dinosaurchi/Desktop/Project/stably-prime/trinity/fraxtal-solidity-contracts).

## Scope / goals

- **Goal**: bring Sonic `dLOOP` (core + periphery + venue adapters) into Fraxtal repo with:
  - **Contracts** (production) + required shared libs/interfaces
  - **Deploy scripts** (`hardhat-deploy`) integrated into Fraxtal’s deployment flow
  - **Tests** (unit + mocks) so the module is safe to iterate on
  - **Config typing + example configs**
- **Non-goals (initially)**:
  - full end-to-end integration testing against a complete protocol stack, unless explicitly opted-in (see Step 05)
  - refactors unrelated to dLOOP unless needed to satisfy the network-agnostic requirement

## Current repo reality (important discovery)

Fraxtal repo already contains **partial / parallel dLOOP work**:

- **Contracts exist** under `contracts/vaults/dLOOP/**` (note `vaults/` plural, and `dLOOP` casing).
- **Deploy scripts exist** under `deploy/19_dloop/**`.
- **Config types already include** `dLoop: DLoopConfig` in `config/types.ts`.

Sonic repo’s dLOOP canonical module is here:

- `sonic-solidity-contracts-2/contracts/vaults/dloop/**`
- `sonic-solidity-contracts-2/deploy/12_dloop/**`
- `sonic-solidity-contracts-2/test/dloop/**`

**Key gap**: Fraxtal’s `contracts/vaults/dLOOP/**` is missing multiple Sonic contracts (notably `DLoopCoreLogic`, `DLoopQuoter`, `DLoopRedeemerBase`, `DLoopIncreaseLeverageBase`, `DLoopDecreaseLeverageBase`, and mock venues).

So this migration is **not** “copy a folder and done”; it is a **reconciliation + completion** task.

## Required design constraints (network-agnostic)

- **Contracts**:
  - must not embed chain addresses, RPC URLs, chain IDs, or network names
  - must remain deterministic and reusable across networks
- **Deploy scripts**:
  - must not embed chain addresses or network names
  - must read all addresses/params from config or prior deployments
  - may skip **local networks** using existing helpers (this is allowed)
- **Config loading**:
  - must support adding a new network without editing a hardcoded allowlist
  - recommended implementation (see Step 02):
    - `PRIMARY`: load config via env var path (TS/JS/JSON)
    - `SECONDARY`: auto-load `config/networks/<hre.network.name>.ts` if present

## Implementation rules (to avoid “dependency hell”)

- Only work on **one step per implementation session**.
- At the end of the session:
  - update `ai-docs/migrate-dloop-to-this-repo/steps/progress.md` (checkboxes + session log)
  - stop and request human review before starting the next step

## Step-by-step execution

Step docs live in:

- `ai-docs/migrate-dloop-to-this-repo/steps/`

### Step list

- **Step 00** — Scope decisions + target shape + reconcile existing Fraxtal dLOOP vs Sonic dLOOP  
  - `ai-docs/migrate-dloop-to-this-repo/steps/00-scope-and-target-shape.md`
- **Step 01** — Contracts migration (Sonic → Fraxtal) + compilation green  
  - `ai-docs/migrate-dloop-to-this-repo/steps/01-contracts-sync-and-compilation.md`
- **Step 02** — Config typing + **network-agnostic config loader** + example configs  
  - `ai-docs/migrate-dloop-to-this-repo/steps/02-config-and-network-agnostic-loader.md`
- **Step 03** — Deploy scripts: port missing Sonic deploy scripts + align tags/IDs with Fraxtal conventions  
  - `ai-docs/migrate-dloop-to-this-repo/steps/03-deploy-scripts-port-and-align.md`
- **Step 04** — Tests: port Tier A unit + mocks (fast, deterministic)  
  - `ai-docs/migrate-dloop-to-this-repo/steps/04-tests-tier-a-unit-and-mocks.md`
- **Step 05 (optional)** — Tests: Tier B DLend integration (heavy)  
  - `ai-docs/migrate-dloop-to-this-repo/steps/05-tests-tier-b-integration-dlend.md`
- **Step 06 (optional)** — CI / hygiene (compile + tests + formatting)  
  - `ai-docs/migrate-dloop-to-this-repo/steps/06-ci-and-hygiene.md`

## Test plan (high-level)

Two tiers (run them in this order):

- **Tier A (must-have)**: unit + mock tests that do not require a full protocol deployment
  - Port from Sonic `test/dloop/**` excluding `DLoopCoreDLend/full-flow.test.ts`
  - Ensure `make test.contract` (or targeted `yarn hardhat test test/dloop/...`) passes for Tier A
- **Tier B (optional, heavy)**: end-to-end + real DLend assumptions
  - Port Sonic `test/dloop/DLoopCoreDLend/full-flow.test.ts` (and friends) only after Tier A is stable

## Progress tracking (required)

Use this file as the single source of truth:

- `ai-docs/migrate-dloop-to-this-repo/steps/progress.md`

