## Step 06 (optional) — CI + release hygiene

### Goal

Add guardrails so the new dLOOP repo stays healthy (compile/test) and is easy to consume.

### CI jobs (recommended)

- **Install + compile**
  - `yarn install --frozen-lockfile`
  - `yarn hardhat compile`
- **Unit tests**
  - `yarn hardhat test test/dloop` (Tier A only by default)
- **Format/lint** (optional)
  - `yarn lint`
  - `yarn prettier:check`

### Versioning / packaging (if publishing)

If the destination repo is a package:

- export artifacts or TypeChain types consistently
- document Solidity compiler version and deployment assumptions

### Stop condition (ask for review)

Stop once CI is green and documented.
