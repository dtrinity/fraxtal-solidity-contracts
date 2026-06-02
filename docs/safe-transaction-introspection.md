# Safe Transaction Introspection

Use the root `transaction-verification-tools` package to review queued governance Safe transactions with local deployment labels.

```bash
cd ../transaction-verification-tools
npm run safe:pending -- \
  --manifest ../fraxtal-solidity-contracts/manifests/fraxtal-mainnet-roles.json
```

Fraxtal Safe does not use the standard `safe-transaction-*.safe.global` host names. The Safe UI at `https://safe.mainnet.frax.com` uses:

- Safe Gateway: `https://safe-gateway.mainnet.frax.com`
- Safe Transaction Service: `https://safe.mainnet.frax.com/txs`

The root tool defaults to the Fraxtal gateway for chain ID `252`, because the gateway returns queued Safe transactions with decoded MultiSend actions. To override endpoints:

```bash
cd ../transaction-verification-tools
npm run safe:pending -- \
  --manifest ../fraxtal-solidity-contracts/manifests/fraxtal-mainnet-roles.json \
  --gateway-url https://safe-gateway.mainnet.frax.com
npm run safe:pending -- \
  --manifest ../fraxtal-solidity-contracts/manifests/fraxtal-mainnet-roles.json \
  --stdout-json
```

Review checklist:

1. Compare each queued nonce with the on-chain Safe nonce shown in the Safe UI.
2. Confirm every target address maps to the expected local deployment artifact.
3. For ownership or proxy-admin moves, verify the proposed new owner/admin is the intended governance timelock.
4. Check the timelock delay and roles before signing: the governance Safe should hold proposer/executor/canceller roles, and the deployer should not hold governance roles.
