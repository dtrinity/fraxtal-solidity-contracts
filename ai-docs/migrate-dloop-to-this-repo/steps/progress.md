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
- [x] Step 02 complete — config types updated + network-agnostic config loader implemented + example configs added
- [x] Step 03 complete — deploy scripts complete (core logic + quoter + periphery) and idempotent
- [x] Step 04 complete — Tier A tests ported + passing
- [ ] Step 05 complete (optional) — Tier B DLend integration tests ported + passing
- [ ] Step 06 complete (optional) — CI green

### Current step

- **In progress**: Step 04 (ready for review)
- **Blocked on**: Review of Step 04

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
- 2025-12-22: Step 02
  - What changed:
    - Added network-agnostic config loader with FRACTAL_CONFIG_PATH override + profile selection support.
    - Expanded dLOOP config typing (core params + Odos periphery types) and added a typed example config.
    - Filled testnet dLOOP core vault config with minDeviation/withdrawal fee and DLend extra params.
  - Commands run:
    - `yarn ts-lint` (failed: fastqueue concurrency must be greater than 1)
    - `./node_modules/.bin/eslint .`
    - `./node_modules/.bin/hardhat compile`
  - Notes / follow-ups:
    - Hardhat compile warns about Node 22 and missing env vars, but completes.
- 2025-12-23: Step 03
  - What changed:
    - Added dLOOP deploy IDs for core logic, quoter, and Odos redeemer/increase/decrease leverage.
    - Added deploy scripts for DLoopCoreLogic + DLoopQuoter and Odos redeemer/increase/decrease leverage.
    - Updated Odos swap logic deploy gating and aligned fraxtal_testnet dLOOP config to Odos-only periphery sections.
  - Commands run:
    - `./node_modules/.bin/eslint deploy/19_dloop config/networks/fraxtal_testnet.ts`
  - Notes / follow-ups:
    - Awaiting review before starting Step 04.
- 2025-12-23: Step 03 follow-up
  - What changed:
    - Aligned core DLend deploy script with Sonic parity (struct args, library linking, rewards/aToken resolution).
  - Commands run:
    - `./node_modules/.bin/eslint deploy/19_dloop/00_core/00_deploy_core_vaults.ts`
  - Notes / follow-ups:
    - Awaiting review before starting Step 04.
- 2025-12-23: Step 04
  - What changed:
    - Ported Tier A dLOOP tests from Sonic into `test/dloop/**`.
    - Added missing testing contracts (harness + mintable/flash-mintable tokens) under `contracts/testing/**`.
    - Aligned test imports to Fraxtal constants and OpenZeppelin v5 paths.
  - Commands run:
    - `./node_modules/.bin/eslint test/dloop`
    - `./node_modules/.bin/hardhat test test/dloop/DLoopCoreLogic/basic_calculation.test.ts`
    - `./node_modules/.bin/hardhat test test/dloop/**/*.ts`
  - Notes / follow-ups:
    - Awaiting review before starting Step 05.
