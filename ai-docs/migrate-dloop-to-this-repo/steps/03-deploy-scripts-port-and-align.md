## Step 03 — Deploy scripts (port missing Sonic scripts + align with Fraxtal)

### Objective

Ensure Fraxtal has a complete set of `hardhat-deploy` scripts to deploy Sonic-parity dLOOP:

- Core logic library (linkable)
- Core DLend vault(s)
- Quoter
- Periphery (Odos): swap logic + depositor + redeemer + increase/decrease leverage

### Source of truth

Sonic deploy scripts:

- `sonic-solidity-contracts-2/deploy/12_dloop/**`

Fraxtal existing deploy module:

- `fraxtal-solidity-contracts/deploy/19_dloop/**`

### Work items

#### A) Align deploy IDs and tags

Fraxtal convention: put string IDs in a deploy-ids module and reuse in scripts/tests.

- Check existing IDs in:
  - `fraxtal-solidity-contracts/utils/vault/deploy-ids.ts`
  - `fraxtal-solidity-contracts/utils/dex/deploy-ids.ts`
- Add missing IDs required by Sonic parity, e.g.:
  - `DLOOP_CORE_LOGIC_ID`
  - `DLOOP_QUOTER_ID`
  - `DLOOP_REDEEMER_ODOS_ID`
  - `DLOOP_INCREASE_LEVERAGE_ODOS_ID`
  - `DLOOP_DECREASE_LEVERAGE_ODOS_ID`

Tags:

- Keep a stable module tag: `["dloop", ...]`
- Sub-tags by component: `core`, `quoter`, `periphery`, `odos`, `increase-leverage`, `decrease-leverage`, etc.

#### B) Port / implement missing scripts

Map Sonic scripts into Fraxtal’s `deploy/19_dloop/` structure.

Sonic → Fraxtal mapping (suggested):

- `deploy/12_dloop/01_core/00_core_logic.ts`
  - → `deploy/19_dloop/00_core/00_core_logic.ts`
- `deploy/12_dloop/01_core/01_dlend.ts`
  - → (Fraxtal already has `00_deploy_core_vaults.ts`; reconcile so it links core logic if Sonic requires it)
- `deploy/12_dloop/01_core/02_quoter.ts`
  - → `deploy/19_dloop/00_core/01_quoter.ts`
- `deploy/12_dloop/02_periphery/00_odos_swap_logic.ts`
  - → `deploy/19_dloop/03_periphery_odos/00_swap_logic.ts` (already exists; reconcile for parity)
- `deploy/12_dloop/02_periphery/01_odos_depositor.ts`
  - → `deploy/19_dloop/03_periphery_odos/01_deploy_depositor.ts` (already exists; reconcile)
- `deploy/12_dloop/02_periphery/02_odos_redeemer.ts`
  - → `deploy/19_dloop/03_periphery_odos/02_deploy_redeemer.ts` (new, unless using “withdrawer” naming)
- `deploy/12_dloop/02_periphery/03_odos_decrease_leverage.ts`
  - → `deploy/19_dloop/03_periphery_odos/03_deploy_decrease_leverage.ts` (new)
- `deploy/12_dloop/02_periphery/04_odos_increase_leverage.ts`
  - → `deploy/19_dloop/03_periphery_odos/04_deploy_increase_leverage.ts` (new)

Implementation notes:

- Use Fraxtal helper `deployContract` (`utils/deploy.ts`) for consistency.
- When deploying contracts that link libraries:
  - deploy library first
  - pass library address mapping to `deployContract`
  - ensure `func.dependencies` includes the library deploy ID(s)
- Scripts must be **idempotent**:
  - set `func.id = <stable-id>`
  - avoid redeploying if already deployed (hardhat-deploy does this by default when `func.id` is stable)

#### C) Ensure scripts are config-driven (network-agnostic)

- No hardcoded addresses in scripts.
- All addresses must come from:
  - Fraxtal config (`getConfig(hre)`)
  - or prior deployments (`hre.deployments.get(<ID>)`)

If a component is not configured for a network, scripts should **skip gracefully** (log and return).

### Validation / commands

From Fraxtal repo root:

- `yarn hardhat deploy --network localhost --tags dloop` (should deploy or skip appropriately)
- `yarn hardhat deploy --network fraxtal_testnet --tags dloop --dry-run` (if supported; otherwise just deploy to a fork/local)

### Acceptance criteria

- All Sonic-parity deploy scripts exist in Fraxtal (or an explicitly documented alternative exists).
- Deploy order and dependencies are explicit via `func.dependencies`.
- Deploy scripts do not contain chain-specific constants.
- `steps/progress.md` updated and Step 03 checked when complete.
