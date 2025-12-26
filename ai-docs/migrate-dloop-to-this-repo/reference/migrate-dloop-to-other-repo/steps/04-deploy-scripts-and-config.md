## Step 04 — Deploy scripts + network-agnostic config

### Goal

Port the dLOOP deploy scripts and redesign config loading so deployments work on any network without hardcoding network names/addresses.

### What to migrate from source repo

#### Deploy scripts

Copy:

- `deploy/12_dloop/01_core/00_core_logic.ts`
- `deploy/12_dloop/01_core/01_dlend.ts`
- `deploy/12_dloop/01_core/02_quoter.ts`
- `deploy/12_dloop/02_periphery/00_odos_swap_logic.ts`
- `deploy/12_dloop/02_periphery/01_odos_depositor.ts`
- `deploy/12_dloop/02_periphery/02_odos_redeemer.ts`
- `deploy/12_dloop/02_periphery/03_odos_decrease_leverage.ts`
- `deploy/12_dloop/02_periphery/04_odos_increase_leverage.ts`

Then, in the new repo, place them under something like `deploy/dloop/**` (optional), but keep `func.tags` / `func.id` stable.

#### Deploy IDs

Copy and **trim**:

- `typescript/deploy-ids.ts` (keep only dLOOP-related IDs)

### The network-agnostic refactor you must do

In the source repo, deploy scripts assume other protocol deployments exist in `hre.deployments`:

- `POOL_ADDRESSES_PROVIDER_ID`
- `POOL_DATA_PROVIDER_ID`
- `INCENTIVES_PROXY_ID`
- `DUSD_A_TOKEN_WRAPPER_ID`

That is not “standalone dLOOP”. In the new repo:

- Replace these dependencies with config fields.
- Keep convenience “lookup from deployments if present” only as a fallback for local dev.

Example rule for each required external address:

- **Preferred**: read from config (`dloop.coreVaults[i].venueParams...`)
- **Fallback**: use `hre.deployments.getOrNull(<id>)` (only for local dev)
- **Otherwise**: throw a clear error explaining the missing config field

### Config loader changes

Replace `config/config.ts` (switch on known networks) with:

- `config/getConfig.ts`:
  - if `process.env.DLOOP_CONFIG_PATH` is set: load config from that file
  - else optionally fall back to `config/networks/<hre.network.name>.ts` if present
  - else throw with a helpful message

### Example config files (add to target repo)

Add at least:

- `config/examples/dloop.local.json`
- `config/examples/dloop.mainnet.json`

These must contain placeholders, not real addresses (or at least make it clear they are examples).

### Deployment order and tags

Keep the same order:

1. `dloop-core-logic` (deploy library `DLoopCoreLogic`)
2. `dloop-core-*` (deploy core vault(s) and link library)
3. `dloop-quoter` (deploy quoter and link library)
4. `dloop-periphery-swap-logic-odos` (deploy library `OdosSwapLogic`)
5. `dloop-periphery-*` (deploy Odos periphery and link library)

### Validation checklist

- [ ] `yarn hardhat deploy --tags dloop` succeeds on `hardhat` network using example config
- [ ] Deployed artifacts show correct library linking

### Stop condition (ask for review)

Stop once deploy scripts can deploy dLOOP contracts on a local network using only dLOOP-specific config.
