## Step 06 (optional) — CI + hygiene

### Objective

Add (or extend) CI checks so dLOOP stays healthy after migration.

### Suggested CI checks

Minimum:

- compile: `yarn hardhat compile`
- unit tests: `yarn hardhat test test/dloop` (Tier A)

Optional:

- formatting/lint: use existing repo commands (e.g. `make lint.contract`, `make lint`)
- Tier B: run only on nightly or behind a “slow” label

### Acceptance criteria

- CI pipeline is green for compile + Tier A tests.
- Tier B tests are either green or intentionally excluded with a clear justification and follow-up ticket.
- `steps/progress.md` updated and Step 06 checked when complete (if you choose to do it).
