## Step 02 — Config typing + network-agnostic config loader + examples

### Objective

Make dLOOP deploy/test configuration:

- **Typed** (`config/types.ts`)
- **Network-agnostic** (new networks can be used without editing a hardcoded allowlist)
- Easy to extend (addresses live in config, not code)

### Current state (Fraxtal)

- `config/types.ts` already contains `dLoop: DLoopConfig` (good baseline)
- `config/config.ts` currently hardcodes a `switch (hre.network.name)` and throws on unknown networks (not network-agnostic)

### Work items

#### A) Confirm/extend `DLoopConfig` typing

Review Sonic dLOOP deploy scripts and ensure Fraxtal typing can express all required fields.

Sonic deploy scripts require (minimum):

- Core:
  - dStable (Sonic calls it `dUSD` often; keep naming consistent in Fraxtal config)
  - per-core-vault config (underlying, leverage BPS, bounds, subsidy BPS)
  - DLend venue requirements (addresses provider, rewards controller, treasury params, etc.)
- Periphery:
  - Odos router (and any Odos-specific params)
  - flash lender (Sonic assumes it equals debt token; keep explicit if needed)

Action:

- Add strongly typed fields rather than stuffing everything into `extraParams: any` if the deploy scripts need them.
- Keep backward compatibility with existing `deploy/19_dloop/**` scripts if they already rely on `DLoopConfig`.

#### B) Implement network-agnostic config loader

Update `config/config.ts` to support at least one of:

- **Env-path loader (recommended)**:
  - `process.env.FRACTAL_CONFIG_PATH=/abs/path/to/config.(ts|js|json)`
  - Optional: `process.env.FRACTAL_CONFIG_PROFILE=<name>` if the config exports multiple profiles
- **Dynamic networks fallback (recommended)**:
  - If no env path is provided, try importing `config/networks/${hre.network.name}.ts`
  - If the file doesn’t exist, throw a helpful error

Constraints:

- Must remain compatible with existing networks (`fraxtal_mainnet`, `fraxtal_testnet`, `localhost`, `hardhat`).
- Must not require editing `config/config.ts` when adding a new network config file.

#### C) Add example configs

Add at least one example config consumers can copy:

- Suggested location:
  - `ai-docs/migrate-dloop-to-this-repo/examples/dloop.example.ts` (preferred, since typed)
  - or `config/examples/dloop.example.ts` (if repo already has `config/examples`)

Example must demonstrate:

- one `coreVaults` entry for DLend venue
- one Odos periphery config entry (router)
- leaving addresses blank is fine, but the field names/shape must match the type

### Validation / commands

- Typecheck:
  - `yarn hardhat compile` (ensures TypeScript config compiles)
- Sanity deploy config load:
  - `yarn hardhat deploy --network localhost --tags dloop` (should either deploy or skip gracefully)
  - Try with a “new” network name + `FRACTAL_CONFIG_PATH` to ensure the loader does not block unknown networks

### Acceptance criteria

- `config/config.ts` no longer blocks unknown networks by default (when `FRACTAL_CONFIG_PATH` is set and valid, or when `config/networks/<name>.ts` exists).
- dLOOP config typing covers the deploy script needs without `any` holes for required fields.
- Example config file exists and is referenced from the top-level `plan.md` or this step doc.
- `steps/progress.md` updated and Step 02 checked when complete.
