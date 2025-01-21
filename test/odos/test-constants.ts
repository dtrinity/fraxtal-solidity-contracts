// Test-only constants for ODOS client tests
export const TEST_FRAXTAL_CHAIN_ID = 252; // Fraxtal Mainnet Chain ID

// Token addresses on Fraxtal Mainnet (from config/networks/fraxtal_mainnet.ts)
export const TEST_FRAXTAL_TOKENS = {
  FRAX: "0xfc00000000000000000000000000000000000001",
  frxETH: "0xFC00000000000000000000000000000000000006", // wfrxETH on Fraxtal mainnet
} as const;

// Token decimals (standard ERC20)
export const TEST_TOKEN_DECIMALS = {
  FRAX: 18,
  frxETH: 18,
} as const;
