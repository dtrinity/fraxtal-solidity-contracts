# Migration Plan: move `contracts/vaults/dloop` to a new repo (network-agnostic)

The original dLOOP repo is located at [sonic-solidity-contracts-2](/Users/dinosaurchi/Desktop/Project/stably-prime/trinity/sonic-solidity-contracts-2).

This document is written for an implementation agent (e.g. GPT-5.1 Codex-mini) to execute **incrementally**. If you follow steps in order and keep the checklist updated, you should not get stuck in dependency hell.

## Scope / goals

- **Goal**: extract dLOOP into a standalone repo (or a clearly isolated package) including:
  - **Contracts** (core + periphery + venue adapters) and required shared libs
  - **Deploy scripts**
  - **Tests**
  - **Configs**
- **Network-agnostic requirement**: the resulting repo must not hardcode chain-specific addresses or chain names (e.g. “sonic_mainnet”). Chain specifics must live in config files / env vars.

## Key discovery (current repo layout)

- **Contracts live here**: `contracts/vaults/dloop/**`
- **Deploy scripts live here**: `deploy/12_dloop/**`
- **Unit tests live here**: `test/dloop/**`
- **Config/types used by deploy scripts**: `config/config.ts`, `config/types.ts`, `config/networks/*`
- **Hardhat compile overrides required** (viaIR for stack-too-deep): in `hardhat.config.ts` overrides for:
  - `contracts/vaults/dloop/periphery/DLoopDepositorBase.sol`
  - `contracts/vaults/dloop/periphery/DLoopRedeemerBase.sol`
  - `contracts/testing/dloop/DLoopCoreDLendHarness.sol`
  - `contracts/vaults/rewards_claimable/RewardClaimable.sol`

## What you are actually migrating (known dependency roots)

### Contracts (direct)

- `contracts/vaults/dloop/**`
- `contracts/vaults/rewards_claimable/RewardClaimable.sol` (required by `DLoopCoreDLend`)
- `contracts/odos/interface/IOdosRouterV2.sol` + `contracts/odos/OdosSwapUtils.sol` (required by `contracts/vaults/dloop/periphery/venue/odos/OdosSwapLogic.sol`)

### Shared internal libs (direct)

Referenced by dLOOP contracts (keep same import paths to avoid churn):

- `contracts/common/BasisPointConstants.sol`
- `contracts/common/Compare.sol`
- `contracts/common/Erc20Helper.sol`
- `contracts/common/Rescuable.sol`
- `contracts/common/SwappableVault.sol`
- `contracts/common/WithdrawalFeeMath.sol`

### Test-only contracts / mocks (direct)

To keep unit tests working you will also need (minimum):

- `contracts/testing/dloop/*` (harnesses)
- `contracts/testing/dlend/*` (mock pool/oracle/rewards controller used by dLend-related tests/harness)
- `contracts/testing/dex/SimpleDEXMock.sol` (used by periphery mock contracts)
- token mocks used by tests (e.g. `TestMintableERC20`, `TestERC20`, etc. from `contracts/testing/**` in this repo)

> Important: **Full integration tests** under `test/dloop/DLoopCoreDLend/*` require a much larger stack (dLend + dUSD + oracle aggregator + deploy-mocks flow). Plan below treats them as an optional track unless you choose the “full extraction” strategy.

## Recommended target-repo structure (keep import roots stable)

Keep `contracts/` as the root and preserve the `contracts/...` import prefix:

- **Reason**: dLOOP code uses imports like `contracts/common/...` which will break if you rename the root.

Suggested structure:

- `contracts/`
  - `vaults/dloop/**`
  - `vaults/rewards_claimable/**` (only what dLOOP needs)
  - `common/**` (only what dLOOP needs)
  - `odos/**` (only what dLOOP needs)
  - `testing/**` (only what your tests need)
- `deploy/`
  - `dloop/**` (move/rename `deploy/12_dloop/**` here; keep tags/ids stable)
- `test/dloop/**`
- `config/`
  - `types.ts` (trim to dLOOP surface)
  - `getConfig.ts` (network-agnostic loader; see below)
  - `networks/` (optional convenience; do NOT hardcode a fixed set of chains)
- `typescript/`
  - `deploy-ids.ts` (trim to dLOOP ids)
  - minimal helpers used by deploy/tests (`common/assert.ts`, `common/bps_constants.ts`, etc.)

## Network-agnostic config design (required)

Current `config/config.ts` switches on `hre.network.name` with a fixed allowlist. In the migrated repo, replace this with:

- **Primary**: load config from a user-provided file path:
  - `process.env.DLOOP_CONFIG_PATH=/abs/path/to/config.json` (or `.ts`)
  - `process.env.DLOOP_CONFIG_PROFILE=<name>` (optional)
- **Secondary (optional)**: fallback to `config/networks/<hre.network.name>.ts` if present.
- **Never**: hardcode chain IDs, RPC URLs, or addresses inside the code.

Minimal config fields your deploy scripts need (suggested):

- **Core**:
  - `dloop.debtToken` (aka “dUSD” in current repo; but keep it generic)
  - `dloop.coreVaults[]`:
    - `name`, `symbol`, `collateralToken`, `debtToken`
    - `targetLeverageBps`, `lowerBoundTargetLeverageBps`, `upperBoundTargetLeverageBps`
    - `maxSubsidyBps`, `minDeviationBps`, `withdrawalFeeBps`
    - `venue` + `venueParams` (venue-specific addresses)
      - for `dlend`: `poolAddressesProvider`, `rewardsController`, `assetToClaimFor`, `targetStaticATokenWrapper`, `treasury`, `maxTreasuryFeeBps`, `initialTreasuryFeeBps`, `initialExchangeThreshold`
- **Periphery**:
  - `dloop.periphery.flashLender` (ERC3156 lender; current code assumes it equals debt token)
  - `dloop.periphery.odos.router` (only if you deploy Odos periphery)

## Deployment model (what gets deployed and in what order)

Hardhat-deploy scripts currently deploy:

- **Libraries**:
  - `DLoopCoreLogic` (`deploy/12_dloop/01_core/00_core_logic.ts`)
  - `OdosSwapLogic` (`deploy/12_dloop/02_periphery/00_odos_swap_logic.ts`)
- **Core**:
  - `DLoopCoreDLend` per configured vault instance (`deploy/12_dloop/01_core/01_dlend.ts`) and links `DLoopCoreLogic`
- **Quoter**:
  - `DLoopQuoter` (`deploy/12_dloop/01_core/02_quoter.ts`) and links `DLoopCoreLogic`
- **Periphery (Odos)**:
  - `DLoopDepositorOdos`, `DLoopRedeemerOdos`, `DLoopDecreaseLeverageOdos`, `DLoopIncreaseLeverageOdos` linking `OdosSwapLogic`

In the migrated repo, keep this order, but refactor scripts so **all addresses come from config** (or are read from prior deployments in the same repo), not from unrelated protocol deployments.

## Test strategy (how to keep this manageable)

There are 2 tiers of tests:

- **Tier A (must migrate)**: dLOOP math & core behavior tests that do NOT require the full protocol stack:
  - `test/dloop/DLoopCoreLogic/**`
  - `test/dloop/DLoopCoreMock/**` (+ fixtures)
  - `test/dloop/DLoop*Mock/**` for periphery base logic (flashloan + swap mocked)
- **Tier B (optional, heavy)**: dLend + dUSD + oracle + deploy-mocks driven integration:
  - `test/dloop/DLoopCoreDLend/**`

If your goal is a clean standalone dLOOP repo, start with **Tier A** and only pull Tier B once Tier A is stable.

## Step-by-step execution (implemented across sessions)

This migration is too large for one session. Execute step docs in order and stop after each step for review.

Step docs live in:

- `ai-docs/steps/migrate-dloop-to-other-repo/`

### Step list

- **Step 00**: Decide extraction strategy + define the target repo shape + create progress checklist  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/00-scope-and-target-shape.md`
- **Step 01**: Migrate contracts + minimal dependencies (compile green)  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/01-contracts-and-dependency-copy-list.md`
- **Step 02**: Tooling (Hardhat, viaIR overrides, typechain)  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/02-tooling-hardhat-build.md`
- **Step 03**: Migrate Tier A tests + test-only contracts  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/03-tests-tier-a-unit-and-mocks.md`
- **Step 04**: Migrate deploy scripts + network-agnostic config loader + example configs  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/04-deploy-scripts-and-config.md`
- **Step 05 (optional)**: Migrate Tier B integration tests + dLend adapter assumptions  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/05-tests-tier-b-dlend-integration.md`
- **Step 06 (optional)**: Add CI (compile + test + formatting)  
  - See `ai-docs/steps/migrate-dloop-to-other-repo/06-ci-and-release-hygiene.md`

## Progress tracking (required)

- Use `ai-docs/steps/migrate-dloop-to-other-repo/progress.md` as the single source of truth.
- **Rule**: in each implementation session, only work on **one step**. Update the checklist + add a short session note, then stop and ask for review.
