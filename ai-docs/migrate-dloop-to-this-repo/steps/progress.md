## Progress: migrate Sonic dLOOP into Fraxtal repo

### How to use this file

- Treat this as the **single source of truth** for migration status.
- At the end of each implementation session:
  - Check/uncheck items
  - Add a short session log entry
  - Stop and ask for review before moving to the next step

### Overall checklist

- [x] Step 00 complete — scope decisions + target shape agreed (incl. reconciliation with existing Fraxtal dLOOP)
- [ ] Step 01 complete — contracts synced from Sonic + `yarn hardhat compile` passes
- [ ] Step 02 complete — config types updated + network-agnostic config loader implemented + example configs added
- [ ] Step 03 complete — deploy scripts complete (core logic + quoter + periphery) and idempotent
- [ ] Step 04 complete — Tier A tests ported + passing
- [ ] Step 05 complete (optional) — Tier B DLend integration tests ported + passing
- [ ] Step 06 complete (optional) — CI green

### Current step

- **In progress**: Step 00
- **Blocked on**: Review of Step 00 decisions

### Session log

- 2025-02-22: Step 00
  - What changed:
    - Documented scope decisions for folder path, parity, naming strategy, and config loader approach.
  - Commands run:
    - None
  - Notes / follow-ups:
    - Awaiting review before starting Step 01.
