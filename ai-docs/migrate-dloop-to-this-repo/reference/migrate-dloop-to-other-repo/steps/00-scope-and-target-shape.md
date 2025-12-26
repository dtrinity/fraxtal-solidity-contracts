## Step 00 — Scope and target repo shape (decisions first)

### Goal

Make the key decisions that determine how big the migration is, and lock down a target repo structure that keeps imports stable.

### Why this step exists

dLOOP sits on top of several “platform” modules (common libs, odos integration, reward-claiming, dLend integration, and a large test/deploy stack). If you start copying files without deciding what “standalone” means, the migration can balloon.

### Decision: which migration strategy?

Pick ONE, record it in `progress.md` under “Current step”.

#### Option A — dLOOP standalone (recommended)

- **What you migrate**
  - dLOOP contracts (`contracts/vaults/dloop/**`)
  - minimal shared libs used by dLOOP (from `contracts/common/**`)
  - odos swap utils/interfaces used by dLOOP periphery
  - reward claimable (only if you keep `DLoopCoreDLend`)
  - Tier A tests (CoreLogic/CoreMock/periphery mocks)
  - deploy scripts for dLOOP only (libraries + dLOOP contracts)
- **What you do NOT migrate**
  - full dStable + dLend + oracle aggregator deployment systems
  - Tier B integration tests (`test/dloop/DLoopCoreDLend/**`) unless later added as optional step
- **Pros**: smaller repo, faster compile/test, network-agnostic by design
- **Cons**: you lose “full protocol” integration coverage inside this repo (can be provided elsewhere)

#### Option B — full extraction (dLOOP + full protocol stack)

- **What you migrate**: Option A + the entire dependency stack to run Tier B tests and end-to-end deployments.
- **Pros**: keep all integration tests working in a single repo
- **Cons**: effectively a fork of the current repo; not a clean dLOOP module; harder to keep network-agnostic

### Target repo structure (recommended)

To avoid import rewrites, preserve the `contracts/...` root imports:

- `contracts/`
  - `vaults/dloop/**`
  - `common/**` (only required subset)
  - `odos/**` (only required subset)
  - `vaults/rewards_claimable/**` (only required subset)
  - `testing/**` (only required subset for tests)
- `deploy/` (hardhat-deploy scripts)
- `test/`
- `config/`
- `typescript/` (deploy ids + tiny helpers)

### Network-agnostic baseline rules

- **No hardcoded network names** inside code (`sonic_mainnet`, `sonic_testnet`, etc.).
- **No hardcoded addresses** inside code.
- **Config must be externalized**:
  - Default: `DLOOP_CONFIG_PATH=/path/to/config.json`
  - Optional: `config/networks/<hre.network.name>.ts` fallback if present

### Deliverables for this step

- [ ] `progress.md` updated with chosen option (A or B) and target repo shape notes
- [ ] A short list of what will be migrated vs excluded (copy the “Option A/B” bullets you chose)

### Stop condition (ask for review)

Stop after decisions are written into `progress.md`. Do NOT start copying code in this step.
