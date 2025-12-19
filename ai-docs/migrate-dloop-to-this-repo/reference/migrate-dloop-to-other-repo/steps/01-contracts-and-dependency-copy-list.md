## Step 01 — Migrate contracts + dependency copy list (compile green)

### Goal

Copy dLOOP contracts and the minimal set of Solidity dependencies into the target repo, preserving import paths so `yarn hardhat compile` succeeds.

### Inputs (source repo paths)

- dLOOP root: `contracts/vaults/dloop/**`
- dLOOP deploy scripts: `deploy/12_dloop/**` (migrated later in Step 04)

### Output (target repo state)

- `contracts/vaults/dloop/**` exists and compiles
- `contracts/common/**` contains required subset used by dLOOP
- `contracts/odos/**` contains required subset used by dLOOP periphery (Odos)
- `contracts/vaults/rewards_claimable/**` contains required subset if you keep `DLoopCoreDLend`

### Copy list (known direct dependencies)

#### dLOOP contracts

- Copy **everything** under:
  - `contracts/vaults/dloop/`

#### Internal common libs used by dLOOP

Copy these files first:

- `contracts/common/BasisPointConstants.sol`
- `contracts/common/Compare.sol`
- `contracts/common/Erc20Helper.sol`
- `contracts/common/Rescuable.sol`
- `contracts/common/SwappableVault.sol`
- `contracts/common/WithdrawalFeeMath.sol`

Then compile; if the compiler reports additional missing imports from within `contracts/common/**`, copy those too (transitive dependencies).

#### Odos subset used by dLOOP periphery

Copy:

- `contracts/odos/OdosSwapUtils.sol`
- `contracts/odos/interface/IOdosRouterV2.sol`

#### Reward-claiming subset (only if you keep `DLoopCoreDLend`)

Copy:

- `contracts/vaults/rewards_claimable/RewardClaimable.sol`

### Special notes

#### Solidity version

- dLOOP uses `pragma solidity ^0.8.20;`. Keep compiler at `0.8.20` for parity.

#### Preserve import roots

- dLOOP imports with `contracts/...`. Ensure the target repo’s Hardhat `paths.sources` points to `./contracts` and that files live under `contracts/`.

#### Libraries and linking

- `DLoopCoreLogic` is a Solidity library deployed + linked by hardhat-deploy scripts.
- `OdosSwapLogic` is a Solidity library deployed + linked by hardhat-deploy scripts.
You do **not** need to link these to compile; you need correct Hardhat library artifacts and deploy scripts later.

### Validation checklist

- [ ] `yarn hardhat compile` passes
- [ ] No remaining `File not found` Solidity import errors

### Common failure modes + fixes

- **Import path mismatch**: If you see `contracts/common/...` not found, you changed the repo layout. Revert to the recommended structure (keep `contracts/` root).
- **Stack-too-deep**: later steps add viaIR overrides; for now, just get compile green with the baseline config (or temporarily enable `viaIR` globally).

### Stop condition (ask for review)

Stop once compilation is green. Do NOT migrate tests or deploy scripts in this step.
