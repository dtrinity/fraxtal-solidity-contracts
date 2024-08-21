# Oracle based on DEX pool

Origin: [https://github.com/Mean-Finance/uniswap-v3-oracle](https://github.com/Mean-Finance/uniswap-v3-oracle)

## Setting cardinality
The `CARDINALITY_PER_MINUTE` should be set based on how quickly the network produces blocks per minute, since each block represents one price point.
For example if a blockchain produces 1 block every 15 seconds (or 4 blocks per minute) we would set the value to 4.

Example values from https://github.com/Balmy-protocol/uniswap-v3-oracle/blob/main/deploy/001_deploy.ts#L23-L37
```
export const CARDINALITY_PER_MINUTE: { [chainId: string]: number } = {
  '1': 4, // Ethereum: Blocks every ~15s
  '3': 1, // Ethereum Ropsten: Blocks every ~60s
  '5': 4, // Ethereum Goerli: Blocks every ~15s
  '42': 13, // Ethereum Kovan: Blocks every ~4s
  '10': 60, // Optimism: Blocks every ~1s
  '56': 20, // BNB: Blocks every ~3
  '42161': 60, // Arbitrum: Blocks every ~1s
  '137': 30, // Polygon: Blocks every ~2s
  '80001': 12, // Polygon Mumbai: Blocks every ~5s
};
```