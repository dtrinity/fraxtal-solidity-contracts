## Step 03 — Tests (Tier A): CoreLogic + CoreMock + periphery mocks

### Goal

Port the “standalone” dLOOP tests that do not require the full protocol stack (dLend + dUSD + oracle aggregator deployments).

### What counts as Tier A in the source repo

Copy these test directories:

- `test/dloop/DLoopCoreLogic/**`
- `test/dloop/DLoopCoreMock/**`
- `test/dloop/DLoopDepositorMock/**`
- `test/dloop/DLoopRedeemerMock/**`
- `test/dloop/DLoopIncreaseLeverageMock/**`
- `test/dloop/DLoopDecreaseLeverageMock/**`

### Test-only contract dependencies you will likely need

These are referenced either directly by tests or by the periphery mock contracts:

- `contracts/testing/dex/SimpleDEXMock.sol`
- Token mocks used in fixtures (e.g. `TestMintableERC20`)
- dLOOP test harnesses under `contracts/testing/dloop/**` (if referenced)

### Expected edits when porting tests

- **Deploy IDs / deployments.fixture**:
  - Tier A tests mostly deploy contracts directly via `ethers.getContractFactory(...)` and do not need `deployments.fixture([...])`.
  - If any test relies on `hardhat-deploy` fixtures, rewrite it to deploy locally in the test (or provide a minimal `deploy/` fixture script for dLOOP-only mocks).
- **Helpers**:
  - Source tests use some TS helpers like `typescript/common/bps_constants`. Either copy those small helpers or inline constants.

### Validation checklist

- [ ] `yarn hardhat test test/dloop/DLoopCoreLogic` passes
- [ ] `yarn hardhat test test/dloop/DLoopCoreMock` passes
- [ ] Periphery mock test suites pass

### Stop condition (ask for review)

Stop once Tier A tests are green. Do NOT port Tier B integration tests in this step.
