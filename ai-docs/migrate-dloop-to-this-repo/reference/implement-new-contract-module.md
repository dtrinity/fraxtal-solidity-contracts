# Implementing a new contract module in `fraxtal-solidity-contracts`

This doc is a practical checklist for adding **new Solidity contract logic**, wiring it into **deployment scripts**, **network configs**, and **tests** in the Fraxtal repo.

---

## Repo conventions (what to follow)

- **Contracts root**: all production contracts live under `fraxtal-solidity-contracts/contracts` (Hardhat sources path is `./contracts`).
- **Vault contracts**: vaults must live under `fraxtal-solidity-contracts/contracts/vaults/` (create a subfolder per vault module, e.g. `contracts/vaults/my_vault/...`).
- **Deployments**: use `hardhat-deploy`. Scripts live under `fraxtal-solidity-contracts/deploy/` and are grouped by module using numeric prefixes (e.g. `19_dloop/...`).
- **Network config**: use `config/getConfig(hre)` (backed by `config/networks/*.ts` and typed by `config/types.ts`).
- **Tests**: TypeScript tests live under `fraxtal-solidity-contracts/test/` and commonly use `deployments.fixture(["tag1", "tag2"])`.

---

## Step 0 — Choose the module scope and folder

Before writing code, decide:

- **Module name**: a short stable identifier used for folder names, tags, and deploy IDs (e.g. `dStake`, `dloop`, `oracle_aggregator`, `my_module`).
- **Contract category**:
  - **Core protocol contract**: put in `contracts/<module>/...`
  - **Vault contract**: put in `contracts/vaults/<module>/...`
  - **Shared libs/interfaces**: prefer existing folders like `contracts/common`, `contracts/shared` when it truly is shared across modules.

---

## Step 1 — Implement the contract(s)

- **Location**:
  - Non-vault: `contracts/<module>/<ContractName>.sol`
  - Vault: `contracts/vaults/<module>/<ContractName>.sol`
- **Solidity version**:
  - Pick a compiler version already supported in `utils/hardhat-config/compilers.ts`.
  - If you must introduce a new pragma range/version, you may need to add a new compiler entry (and possibly an `overrides` entry) in `utils/hardhat-config/compilers.ts`.
- **Avoid duplicate contract names**:
  - This repo contains many contracts; if you create a contract name that already exists in another folder, deployments can become ambiguous.
  - If unavoidable, deployments should pass a **fully qualified contract path** / explicit artifact when deploying (see Step 4).

Sanity checks:

```bash
make lint.contract
make compile
```

---

## Step 2 — Add/standardize deploy IDs (recommended)

Hardhat Deploy uses the **deployment name** as the stable key in `deployments/<network>/`.

Recommended patterns in this repo:

- **Central IDs**: `typescript/deploy-ids.ts` contains many cross-module IDs.
- **Module IDs**: some modules keep additional IDs under `utils/<module>/deploy-ids.ts`.

When adding a new module, add constants so deploy scripts and tests don’t hardcode strings. Example approach:

- Add `export const MY_MODULE_FOO_ID = "MyModuleFoo";` to `typescript/deploy-ids.ts` (or `utils/my_module/deploy-ids.ts` if you prefer module-local IDs).
- Use that ID as:
  - `func.id = MY_MODULE_FOO_ID`
  - and/or deployment name prefixes like `${MY_MODULE_FOO_ID}_${instanceKey}` when multi-instance.

---

## Step 3 — Add config plumbing (addresses + params per network)

Most deploy scripts in this repo follow: `const config = await getConfig(hre);` then read module parameters from config.

### 3.1 Update the config types

If your module needs config parameters, add a typed section in `config/types.ts`:

- Add a `readonly myModule?: MyModuleConfig;` field on the top-level `Config` interface.
- Define `export interface MyModuleConfig { ... }` with the parameters your deploy script needs.

### 3.2 Implement per-network config

Update these files (as needed):

- `config/networks/localhost.ts`: best place for local dev defaults and “soft” dependencies.
  - Common pattern: read dependencies via `await hre.deployments.getOrNull("SomeDeployment")` so localhost config can be evaluated even before everything is deployed.
- `config/networks/fraxtal_testnet.ts`: put real testnet addresses and conservative parameters.
- `config/networks/fraxtal_mainnet.ts`: put mainnet addresses and production parameters.

### 3.3 (If applicable) token/oracle configs for dev tooling

If your module depends on local/test token deployments or mock price aggregators, be aware of the separate Hardhat configs:

- `hardhat.config.token.ts`: deploys **test tokens** from `contracts/test` into `deployments/test-tokens`.
- `hardhat.config.price-aggregator.ts`: deploys **test price aggregators** (shares `deployments/test-tokens` so scripts can read the token addresses).

This is only needed if your module relies on those test-only flows.

---

## Step 4 — Add deploy scripts (`hardhat-deploy`)

### 4.1 Create a deploy folder

Create a new folder under `deploy/`:

- `deploy/<NN>_<module>/...` (pick a new numeric prefix that keeps ordering sane)
- If needed, add subfolders:
  - `00_core/`, `01_periphery/`, `02_post/` etc.

### 4.2 Write one deploy script per “unit of work”

Each deploy script should:

- Export a default `DeployFunction`
- Be **idempotent** (safe to rerun)
- Set:
  - `func.tags = [...]` (so tests and targeted deployments can run only what’s needed)
  - `func.dependencies = [...]` (so ordering is explicit)
  - `func.id = "some_stable_id"` (so hardhat-deploy won’t rerun the script once recorded, unless `--reset`)

There are two common deployment styles in this repo:

- **Style A: Use shared helper `deployContract`**
  - Useful for consistent logs + ability to pass an explicit contract path/artifact when contract names collide.
  - Helper lives in `utils/deploy.ts`.
- **Style B: Use `deployments.deploy(...)` directly**
  - Used frequently when deploying proxies (`proxy: { ... }`) and for custom idempotency checks.

### 4.3 Read config inside the script

Typical pattern:

- `const config = await getConfig(hre);`
- Validate required fields are present (throw early)
- Deploy

### 4.4 Handle proxies carefully

If you deploy upgradeable contracts:

- Use `deployments.deploy(..., { proxy: { ... } })` (see existing patterns like dSTAKE).
- Ensure re-runs won’t brick the deploy:
  - Check whether ProxyAdmin exists and whether you still control it (some scripts explicitly verify ownership and skip otherwise).

### 4.5 Make your module easy to deploy selectively (optional)

If you want to selectively deploy just your module:

- Add a unique tag, e.g. `func.tags = ["my_module"]`.
- Optionally add a Makefile target following existing patterns:
  - `yarn hardhat deploy --network <network> --tags "my_module"`

Note: `hardhat.config.ts` already uses `getDefaultDeployScriptPaths()` which defaults to deploying everything under `deploy/` unless env flags override it.

---

## Step 5 — Update/confirm permissions + role migration (if applicable)

Many protocols need post-deploy configuration:

- role grants
- ownership transfers
- whitelists
- setting dependencies (oracle sources, treasury, etc.)

In this repo, it’s common to:

- deploy contracts first
- then have a separate “configure” deploy script (tagged and ordered via `func.dependencies`)
- and finally a role-transfer/migration script (often intended for governance multisig / Safe)

If you need Safe-aware flows, note `config/types.ts` supports an optional `safeConfig` on some networks (see `config/networks/fraxtal_mainnet.ts`).

---

## Step 6 — Add tests (TypeScript, Hardhat + hardhat-deploy fixtures)

### 6.1 Where to put tests

- Non-vault module: `test/<module>/...`
- Vault module: `test/vaults/<module>/...` (this repo already follows `test/vaults/*`)

### 6.2 Use fixtures + deployment tags

Preferred pattern:

- Create a fixture in `test/<module>/fixtures.ts` using `deployments.createFixture(...)`.
- Inside the fixture:
  - `await deployments.fixture();` (fresh deployment state)
  - `await deployments.fixture(["tag1", "tag2", ...]);` (deploy only what your tests need)

This approach keeps tests fast and reproducible, and mirrors how production deployments are assembled from tagged scripts.

### 6.3 Run tests

```bash
# Full Hardhat test suite
make test.contract

# One file
yarn hardhat test test/<module>/<SomeTest>.ts

# Curve-related tests (requires local_ethereum)
make run.node.local_ethereum
make test.curve
```

---

## Step 7 — Deploy locally / testnet / mainnet

Common commands:

```bash
# Local node (no deploy on startup)
make run.node.localhost

# Deploy core contracts to localhost
make deploy-contract.localhost

# Deploy to Fraxtal testnet
make deploy-contract.fraxtal_testnet

# Re-deploy (re-run scripts) with reset
make deploy-contract.fraxtal_testnet.reset
```

If you are iterating on a specific tagged module:

```bash
yarn hardhat deploy --network fraxtal_testnet --tags "my_module"
```

---

## Step 8 — Verify on block explorer

Verification is scripted via `scripts/verify-deployments.ts` and Makefile targets:

```bash
# Verify everything (for current network deployments folder)
make explorer.verify.fraxtal_testnet

# Verify only deployments whose name matches a regex (passed through ARGS)
make explorer.verify.fraxtal_testnet ARGS="--match MyModule"

# Verify only specific deployment names
make explorer.verify.fraxtal_testnet ARGS="--only MyModuleFoo,MyModuleBar"
```

Notes:

- Set `ETHERSCAN_API_KEY` in your environment for verification.
- The script tries to infer a “fully qualified name” from deployment metadata when possible (helps when contract names collide).

---

## Common gotchas (read this when something feels “weird”)

- **“Duplicate contract name” errors / wrong artifact picked**:
  - Use explicit `contract` / fully-qualified name during deployment.
  - The helper `deployContract(..., contractPathOrArtifact)` supports passing a contract path or artifact to disambiguate.
- **Compiler mismatch / pragma not supported**:
  - Update `utils/hardhat-config/compilers.ts` to include the needed compiler version.
  - Add an `overrides` entry if only a subset of files need a different compiler.
- **Deploy script doesn’t run**:
  - If `func.id` is already recorded in `deployments/<network>/.migrations.json`, Hardhat Deploy will skip it unless you use `--reset`.
  - If you want re-runnable behavior, keep `func.id` stable and implement idempotency checks inside the script.
- **Local testing vs localhost network**:
  - `hardhat` network in `hardhat.config.ts` has `saveDeployments: false` to avoid stale deployment state during tests.
  - For persistent deployments (so you can reuse addresses between runs), use `localhost` with `saveDeployments: true`.
