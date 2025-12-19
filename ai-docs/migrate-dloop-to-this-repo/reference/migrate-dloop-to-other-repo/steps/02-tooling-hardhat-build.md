## Step 02 — Tooling: Hardhat + build config (viaIR + typechain)

### Goal

Make the target repo compile and type-generate reliably (TypeChain) with the same compiler behavior as the source repo, without hardcoding networks.

### Required tooling components

- **Hardhat** + `hardhat-deploy`
- **TypeChain** + `@typechain/hardhat`
- **OpenZeppelin** contracts dependency

### Hardhat config requirements (from source repo)

The source repo uses:

- multiple solc versions (0.8.20, 0.8.22)
- selective `viaIR` overrides for stack-too-deep files

For a standalone dLOOP repo, you can simplify:

- Start with a single compiler: `0.8.20`
- Add `viaIR` overrides only where needed

### Must-have compile overrides (known)

From `hardhat.config.ts` in this repo, dLOOP needs `viaIR: true` for:

- `contracts/vaults/dloop/periphery/DLoopDepositorBase.sol`
- `contracts/vaults/dloop/periphery/DLoopRedeemerBase.sol`
- `contracts/vaults/rewards_claimable/RewardClaimable.sol` (if present)
- `contracts/testing/dloop/DLoopCoreDLendHarness.sol` (only if you migrate that harness)

### Directory paths

Hardhat config should set:

- `paths.sources = "./contracts"`
- `paths.tests = "./test"`
- `paths.deploy = "./deploy"`
- `paths.deployments = "./deployments"`

### Network configuration (network-agnostic)

In `hardhat.config.ts`:

- Keep only `hardhat` and `localhost` as defaults.
- Add other networks by reading from env vars:
  - `RPC_URL`
  - `PRIVATE_KEY` / `PRIVATE_KEYS`
Do not bake chain names/IDs into code.

### Validation checklist

- [ ] `yarn hardhat compile` passes with no stack-too-deep errors
- [ ] `yarn hardhat typechain` (or compile triggers typechain) generates types

### Stop condition (ask for review)

Stop once compile/typechain are stable. Do NOT migrate deploy scripts/tests in this step.
