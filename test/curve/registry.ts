/* eslint-disable camelcase -- Disable camelcase rule for external contract and token names */

export const CURVE_CONTRACTS = {
  addressProvider: "0x5ffe7FB82894076ECB99A30D6A32e969e6e35E98",
  router: "0x16C6521Dff6baB339122a0FE25a9116693265353",
};

export const WHALES = {
  binance_pegtokenscollateral: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
  bybit_hotwallet: "0xf89d7b9c864f589bbf53a82105107622b35eaa40",
  USDe_whale: "0xf89d7b9c864f589bbf53a82105107622b35eaa40", // bybit_hotwallet
  sDAI_whale: "0x225d3822de44e58ee935440e0c0b829c4232086e", // 1inch_team_investment_fund
};

export const TOKENS = {
  DAI: {
    decimals: 18,
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  },
  USDC: {
    decimals: 6,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  USDT: {
    decimals: 6,
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  FRAX: {
    decimals: 18,
    address: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
  },
  sDAI: {
    decimals: 18,
    address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
  },
  sUSDe: {
    decimals: 18,
    address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
  },
  USDe: {
    decimals: 18,
    address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
  },
};

export const POOLS = {
  stableswapng: {
    sDAI_sUSDe: {
      address: "0x167478921b907422F8E88B43C4Af2B8BEa278d3A",
      tokens: [TOKENS.sDAI, TOKENS.sUSDe],
    },
    USDe_USDC: {
      address: "0x02950460E2b9529D0E00284A5fA2d7bDF3fA4d72",
      tokens: [TOKENS.USDe, TOKENS.USDC],
    },
    USDe_DAI: {
      address: "0xF36a4BA50C603204c3FC6d2dA8b78A7b69CBC67d",
      tokens: [TOKENS.USDe, TOKENS.DAI],
    },
  },
};

export const FRAXTAL_TESTNET_CURVE_CONTRACTS = {
  router: "0xF66c3Ef85BceafaEcE9171E25Eee2972b10e1958",
};

export const FRAXTAL_TESTNET_TOKENS = {
  dUSD: {
    decimals: 6,
    address: "0x4d6e79013212f10a026a1fb0b926c9fd0432b96c",
  },
  sFRAX: {
    decimals: 18,
    address: "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
  },
};

/* eslint-enable camelcase -- Re-enable camelcase rule at the end of the file */
