# FXTL Balance Checkers

This directory contains scripts for testing the deployed balance checker contracts on Fraxtal.

## ERC4626BalanceChecker Test Script

The `test_erc4626_balance_checker.ts` script tests the deployed ERC4626BalanceChecker contract to verify if a user holds any dUSD tokens in the sdUSD (staked dUSD) vault.

### Configuration

The script is configured with the following Fraxtal mainnet addresses:

- **ERC4626BalanceChecker**: `0x09c418A9d8027EF890a91cCDFCe3C14D055E44dd`
- **sdUSD Vault (DStakeToken_sdUSD)**: `0x58AcC2600835211Dcb5847c5Fa422791Fd492409`
- **dUSD Token**: `0x788D96f655735f52c676A133f4dFC53cEC614d4A`

### Usage

To run the test script:

```bash
npx hardhat run scripts/fxtl_balance_checkers/test_erc4626_balance_checker.ts --network fraxtal_mainnet
```

### What the Script Tests

1. **Contract Verification**: Confirms the ERC4626BalanceChecker is properly configured with the correct vault token
2. **Underlying Asset Check**: Verifies the vault's underlying asset is dUSD
3. **User Balance Check**: Tests if the specified user address holds any sdUSD tokens
4. **Vault Information**: Displays total assets, total supply, and user's share percentage
5. **Batch Balance Check**: Tests the batch balance functionality
6. **Asset Conversion**: Demonstrates converting shares to underlying assets

### Example Output

When the user has sdUSD holdings:
```
🔍 Testing ERC4626BalanceChecker on Fraxtal Mainnet
============================================================
📄 ERC4626BalanceChecker: 0x09c418A9d8027EF890a91cCDFCe3C14D055E44dd
🏦 sdUSD Vault: 0x58AcC2600835211Dcb5847c5Fa422791Fd492409
💰 dUSD Token: 0x788D96f655735f52c676A133f4dFC53cEC614d4A
👤 Test User: 0x55e9877c8e66801313607396e7e563391753f800

✅ Configured Vault Token: 0x58AcC2600835211Dcb5847c5Fa422791Fd492409

📊 Vault Information:
🔗 Underlying Asset: 0x788D96f655735f52c676A133f4dFC53cEC614d4A

💼 User Balance Check:
📈 User sdUSD Balance (normalized to 18 decimals): 1234.567890123456789012
✅ User HAS sdUSD holdings!
🏦 Vault Total Assets: 1000000.123456 dUSD
🏦 Vault Total Supply: 987654.321098 sdUSD
📊 User's Vault Share: 1234567890 shares (0.1250%)
💎 User's Assets Value: 1234.567890 dUSD
```

When the user has no sdUSD holdings:
```
💼 User Balance Check:
📈 User sdUSD Balance (normalized to 18 decimals): 0.0
❌ User does NOT hold any sdUSD
```

### Test User

The script is currently configured to test the address: `0x55e9877c8e66801313607396e7e563391753f800`

To test a different address, modify the `TEST_USER_ADDRESS` constant in the script.

### Requirements

- Node.js and npm/yarn installed
- Hardhat configured with Fraxtal mainnet RPC
- Network connection to query Fraxtal mainnet

### Notes

- The script is read-only and does not require any private keys or gas
- All balance values are normalized to 18 decimals for consistency
- dUSD on Fraxtal uses 6 decimals, while the balance checker normalizes to 18 decimals
- The script handles various error cases gracefully and provides informative output