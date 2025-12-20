## Step 04 — Tests (Tier A): unit + mocks (fast, deterministic)

### Objective

Port Sonic’s Tier A tests into Fraxtal so we have strong safety coverage while iterating.

Tier A is “unit + mocks” only: it must run quickly and deterministically without requiring a full on-chain deployment of all protocol modules.

### Source of truth

Sonic tests:

- `sonic-solidity-contracts-2/test/dloop/**`

Tier A (recommended inclusion):

- `test/dloop/DLoopCoreLogic/**`
- `test/dloop/DLoopCoreMock/**`
- `test/dloop/DLoopDepositorMock/**`
- `test/dloop/DLoopRedeemerMock/**`
- `test/dloop/DLoopIncreaseLeverageMock/**`
- `test/dloop/DLoopDecreaseLeverageMock/**`

Tier B (explicitly excluded in this step):

- `test/dloop/DLoopCoreDLend/full-flow.test.ts` (and any tests that require full DLend + oracles + incentives stack)

### Target layout (Fraxtal)

Create:

- `fraxtal-solidity-contracts/test/dloop/**` mirroring Sonic structure as much as possible.

### Test-only contracts / mocks

If Sonic tests depend on contracts that Fraxtal does not have, port them under `contracts/testing/**` (Fraxtal convention: keep test-only Solidity in a dedicated folder).

Minimum expected test-only roots (based on Sonic):

- `contracts/testing/dloop/**` (core/periphery harnesses if needed)
- `contracts/vaults/dLOOP/core/venue/mock/**` (core mocks)
- `contracts/vaults/dLOOP/periphery/venue/mock/**` (periphery mocks)

Port only what tests require; keep production vs testing boundaries clean.

### Fixture strategy

Prefer Fraxtal convention:

- use `deployments.fixture(["dloop", ...])` tags to deploy only what tests need
- keep shared fixture helpers in `test/dloop/fixtures.ts` and import them

### Validation / commands

From Fraxtal repo root:

- `yarn hardhat test test/dloop/DLoopCoreLogic/basic_calculation.test.ts` (first sanity target)
- `yarn hardhat test test/dloop` (after first file passes)
- optionally `make test.contract` if that is the repo’s standard aggregator

### Acceptance criteria

- Tier A test suite passes on `hardhat` network.
- Tests do not require external RPC, chain forking, or live addresses.
- Any required mocks/harnesses exist in Fraxtal with clear boundaries.
- `steps/progress.md` updated and Step 04 checked when complete.
