## Step 05 (optional) — Tests (Tier B): DLend integration (heavy)

### Objective

Port Sonic’s full-flow DLend integration tests after Tier A is stable.

This is optional because it can require:

- a larger deployed stack (DLend + oracles + incentives)
- more fixtures and/or longer test runtime

### Source of truth

Sonic Tier B:

- `sonic-solidity-contracts-2/test/dloop/DLoopCoreDLend/**`

### Strategy options (pick one)

#### Option A: “Local deploy stack” integration

- Use Fraxtal deploy scripts to deploy the required DLend components on `hardhat` or `localhost`.
- Then run dLOOP integration tests against those deployments.

Pros: closest to real deploy flow.  
Cons: potentially slow and more brittle.

#### Option B: “Mock DLend” integration (semi-integration)

- Mock the minimal DLend interfaces needed by `DLoopCoreDLend` for the full-flow test.
- Keep it deterministic and faster.

Pros: more stable; still catches cross-contract issues.  
Cons: less realistic.

### Validation / commands

- Targeted run first:
  - `yarn hardhat test test/dloop/DLoopCoreDLend/simple-test.ts`
- Then expand:
  - `yarn hardhat test test/dloop/DLoopCoreDLend`

### Acceptance criteria

- Tier B tests run in CI-friendly time (or are explicitly marked as “slow” and gated).
- Any network assumptions are removed; tests should not depend on live chain addresses.
- `steps/progress.md` updated and Step 05 checked when complete (if you choose to do it).
