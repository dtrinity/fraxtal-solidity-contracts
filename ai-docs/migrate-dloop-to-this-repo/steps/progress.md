## Progress: migrate Sonic dLOOP into Fraxtal repo

### How to use this file

- Treat this as the **single source of truth** for migration status.
- At the end of each implementation session:
  - Check/uncheck items
  - Add a short session log entry
  - Stop and ask for review before moving to the next step

### Overall checklist

- [x] Step 00 complete — scope decisions + target shape agreed (incl. reconciliation with existing Fraxtal dLOOP)
- [x] Step 01 complete — contracts synced from Sonic + `yarn hardhat compile` passes
- [ ] Step 02 complete — config types updated + network-agnostic config loader implemented + example configs added
- [ ] Step 03 complete — deploy scripts complete (core logic + quoter + periphery) and idempotent
- [ ] Step 04 complete — Tier A tests ported + passing
- [ ] Step 05 complete (optional) — Tier B DLend integration tests ported + passing
- [ ] Step 06 complete (optional) — CI green

### Current step

- **In progress**: Step 01 (ready for review)
- **Blocked on**: Review of Step 01

### Session log

- 2025-02-22: Step 00
  - What changed:
    - Documented scope decisions for folder path, parity, naming strategy, and config loader approach.
  - Commands run:
    - None
  - Notes / follow-ups:
    - Awaiting review before starting Step 01.
- 2025-02-22: Step 01
  - What changed:
    - Copied Sonic dLOOP contracts into `contracts/vaults/dLOOP`.
    - Added missing common helpers (`Compare.sol`, `Rescuable.sol`, `WithdrawalFeeMath.sol`) from Sonic.
    - Updated dLOOP/common imports to use `@openzeppelin/contracts-5` and `contracts/vaults/dLOOP` paths.
    - Added `contracts/testing/dex/SimpleDEXMock.sol` and aligned dLOOP periphery swaps with Fraxtal `SwappableVault` signatures.
    - Fixed Odos swap helper to use the local `OdosSwapUtils` API and return spent input amounts.
  - Commands run:
    - `yarn hardhat compile` (failed: Yarn fastqueue concurrency error)
    - `./node_modules/.bin/hardhat compile`
  - Notes / follow-ups:
    - Hardhat compile succeeded via local binary (see warnings about Node 22 + missing env vars).
