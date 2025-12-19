## Step 05 (optional) — Tests (Tier B): dLend integration

### Goal

Port the heavy integration tests that currently rely on the full protocol deployment stack.

### What Tier B is in the source repo

- `test/dloop/DLoopCoreDLend/**`
  - e.g. `full-flow.test.ts` uses `deployments.fixture([...])` and depends on many deploy tags:
    - `local-setup`, `dusd`, `dlend`, wrappers, and `dloop` tags

### Why this is optional

If you want a standalone dLOOP repo, Tier B tests effectively force you to:

- vendor in large parts of dLend/dStable/oracle infrastructure, or
- run a multi-repo workspace (monorepo / git submodules) where dLOOP imports those dependencies for tests only

### Recommended approach (keep dLOOP repo clean)

Create a separate “integration test harness” repo (or workspace package) that depends on:

- the new dLOOP repo/package
- the protocol stack repo(s) providing dLend + dStable + oracle aggregator deploy fixtures

This keeps:

- dLOOP repo small and network-agnostic
- integration coverage still available, but isolated

### If you insist on keeping Tier B inside the new repo

Be explicit: this becomes Option B (full extraction). You will need to migrate:

- dLend contracts + deploy scripts + mocks
- dUSD/dStable contracts + deploy scripts
- oracle aggregator contracts + deploy scripts
- the deploy tag graph used by `deployments.fixture([...])`

### Validation checklist

- [ ] `yarn hardhat test test/dloop/DLoopCoreDLend` passes

### Stop condition (ask for review)

Stop after Tier B is green (or after the integration harness repo is created and wired).
