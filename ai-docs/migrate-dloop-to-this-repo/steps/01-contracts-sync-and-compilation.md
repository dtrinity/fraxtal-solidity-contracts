## Step 01 — Contracts sync (Sonic → Fraxtal) + compile green

### Objective

Copy the missing Sonic dLOOP Solidity source into Fraxtal, reconcile import paths, and make **`yarn hardhat compile` pass**.

This step is “contracts only”: do not port deploy scripts or tests yet beyond what is necessary to compile.

### Target shape (recommended)

Unless Step 00 decided otherwise, keep Fraxtal’s existing root:

- **Target root**: `fraxtal-solidity-contracts/contracts/vaults/dLOOP/**`

### Source of truth

Use Sonic as canonical:

- `sonic-solidity-contracts-2/contracts/vaults/dloop/**`

### What to port (minimum parity set)

Copy (or reconcile) these paths from Sonic into the Fraxtal dLOOP module:

#### Core

- `core/DLoopCoreBase.sol` (already exists in Fraxtal — **diff and reconcile**, don’t blindly overwrite)
- `core/DLoopCoreLogic.sol` (**missing in Fraxtal**)
- `core/DLoopQuoter.sol` (**missing in Fraxtal**)
- `core/venue/dlend/**` (Fraxtal has a subset — ensure full parity):
  - `DLoopCoreDLend.sol`
  - `interface/**` including `IRewardsController.sol` and `types/DataTypes.sol`
- `core/venue/mock/**` (**missing in Fraxtal**)

#### Periphery

Fraxtal currently has:

- `periphery/DLoopDepositorBase.sol` (exists — diff/reconcile)
- `periphery/DLoopWithdrawerBase.sol` (Fraxtal-specific naming; Sonic uses `DLoopRedeemerBase.sol`)
- `periphery/venue/odos/**` (Fraxtal has only depositor/withdrawer + swap logic)

Port missing Sonic pieces:

- `periphery/DLoopRedeemerBase.sol` (or alias strategy from Step 00)
- `periphery/DLoopIncreaseLeverageBase.sol`
- `periphery/DLoopDecreaseLeverageBase.sol`
- `periphery/helper/SharedLogic.sol`
- `periphery/venue/mock/**`
- `periphery/venue/odos/**`:
  - `DLoopIncreaseLeverageOdos.sol`
  - `DLoopDecreaseLeverageOdos.sol`
  - `DLoopRedeemerOdos.sol`
  - (and ensure `OdosSwapLogic.sol` matches Sonic)

#### Shared

- `shared/RescuableVault.sol` (or equivalent)

### Dependencies (what to reuse vs import)

Before copying random “common” libs, first try to reuse Fraxtal’s existing utilities:

- OpenZeppelin: Fraxtal uses `@openzeppelin/contracts-5/...`
- Shared constants: Fraxtal already has `contracts/shared/Constants.sol`
- Reward claimable: Fraxtal already has `contracts/vaults/rewards_claimable/RewardClaimable.sol`

If Sonic dLOOP imports internal files that don’t exist in Fraxtal, copy them **minimally** and keep import roots stable.

### Compile checklist

1) Ensure compiler versions cover dLOOP

- dLOOP uses `pragma solidity 0.8.20;` (Fraxtal already has `0.8.20` configured).

2) Resolve import path mismatches

Common fixes needed when moving between repos:

- `contracts/vaults/dloop/...` → `contracts/vaults/dLOOP/...` (if keeping Fraxtal layout)
- `contracts/common/...` vs `contracts/shared/...` differences
- OpenZeppelin major version differences (Sonic might have OZ v4/v5 mix; Fraxtal is OZ v5)

3) Make compile pass

Run:

- `yarn hardhat compile`

If you hit “stack too deep”, prefer enabling `viaIR` **only for the specific dLOOP files** via `utils/hardhat-config/compilers.ts` `overrides`, unless global settings already cover it.

### Acceptance criteria

- `yarn hardhat compile` passes from Fraxtal repo root.
- No deploy scripts/tests are required to compile (i.e., compilation stands on its own).
- `steps/progress.md` updated and Step 01 checked when complete.
