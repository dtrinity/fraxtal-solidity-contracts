import { ethers } from "hardhat";
import { ERC4626BalanceChecker } from "../../typechain-types";

// Contract addresses on Fraxtal Mainnet
const ERC4626_BALANCE_CHECKER_ADDRESS =
  "0x09c418A9d8027EF890a91cCDFCe3C14D055E44dd";
const SDUSD_VAULT_ADDRESS = "0x58AcC2600835211Dcb5847c5Fa422791Fd492409"; // DStakeToken_sdUSD
const DUSD_TOKEN_ADDRESS = "0x788D96f655735f52c676A133f4dFC53cEC614d4A";

// Test user address
const TEST_USER_ADDRESS = "0x55e9877c8e66801313607396e7e563391753f800";

async function main() {
  console.log("🔍 Testing ERC4626BalanceChecker on Fraxtal Mainnet");
  console.log("=".repeat(60));

  try {
    // Connect to the deployed ERC4626BalanceChecker contract
    const balanceChecker = await ethers.getContractAt(
      "ERC4626BalanceChecker",
      ERC4626_BALANCE_CHECKER_ADDRESS,
    );

    console.log(`📄 ERC4626BalanceChecker: ${ERC4626_BALANCE_CHECKER_ADDRESS}`);
    console.log(`🏦 sdUSD Vault: ${SDUSD_VAULT_ADDRESS}`);
    console.log(`💰 dUSD Token: ${DUSD_TOKEN_ADDRESS}`);
    console.log(`👤 Test User: ${TEST_USER_ADDRESS}`);
    console.log();

    // Get vault token address from the balance checker
    const vaultToken = await balanceChecker.vaultToken();
    console.log(`✅ Configured Vault Token: ${vaultToken}`);

    if (vaultToken.toLowerCase() !== SDUSD_VAULT_ADDRESS.toLowerCase()) {
      console.log(
        `⚠️  Warning: Expected ${SDUSD_VAULT_ADDRESS}, got ${vaultToken}`,
      );
    }

    // Get underlying asset from the vault
    console.log("\n📊 Vault Information:");
    try {
      const underlyingAsset =
        await balanceChecker.getUnderlyingAsset(vaultToken);
      console.log(`🔗 Underlying Asset: ${underlyingAsset}`);

      if (underlyingAsset.toLowerCase() !== DUSD_TOKEN_ADDRESS.toLowerCase()) {
        console.log(
          `⚠️  Warning: Expected ${DUSD_TOKEN_ADDRESS}, got ${underlyingAsset}`,
        );
      }
    } catch (error) {
      console.log(`❌ Error getting underlying asset: ${error}`);
    }

    // Check if user has any sdUSD balance
    console.log("\n💼 User Balance Check:");
    try {
      // Check the balance using the balance checker
      const userBalances = await balanceChecker.tokenBalances(vaultToken, [
        TEST_USER_ADDRESS,
      ]);

      const normalizedBalance = userBalances[0];
      console.log(
        `📈 User sdUSD Balance (normalized to 18 decimals): ${ethers.formatUnits(normalizedBalance, 18)}`,
      );

      if (normalizedBalance > BigInt(0)) {
        console.log("✅ User HAS sdUSD holdings!");

        // Get more details about the vault
        try {
          const totalAssets = await balanceChecker.getTotalAssets(vaultToken);
          const totalSupply = await balanceChecker.getTotalSupply(vaultToken);

          console.log(
            `🏦 Vault Total Assets: ${ethers.formatUnits(totalAssets, 6)} dUSD`,
          ); // dUSD has 6 decimals
          console.log(
            `🏦 Vault Total Supply: ${ethers.formatUnits(totalSupply, 6)} sdUSD`,
          ); // Assuming same decimals

          // Calculate user's share percentage
          if (totalSupply > BigInt(0)) {
            // Get actual user shares (not normalized)
            const vault = await ethers.getContractAt(
              "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
              vaultToken,
            );
            const userShares = await vault.balanceOf(TEST_USER_ADDRESS);

            const sharePercentage =
              (Number(userShares) / Number(totalSupply)) * 100;
            console.log(
              `📊 User's Vault Share: ${userShares} shares (${sharePercentage.toFixed(4)}%)`,
            );

            // Convert shares to assets
            const assetsFromShares = await balanceChecker.convertSharesToAssets(
              vaultToken,
              userShares,
            );
            console.log(
              `💎 User's Assets Value: ${ethers.formatUnits(assetsFromShares, 6)} dUSD`,
            );
          }
        } catch (error) {
          console.log(`⚠️  Could not get detailed vault info: ${error}`);
        }
      } else {
        console.log("❌ User does NOT hold any sdUSD");
      }
    } catch (error) {
      console.log(`❌ Error checking user balance: ${error}`);
    }

    // Test batch balance check
    console.log("\n🔄 Batch Balance Check:");
    try {
      const batchBalances = await balanceChecker.batchTokenBalances(
        [vaultToken],
        [TEST_USER_ADDRESS],
      );

      console.log(
        `📊 Batch Balance Result: ${ethers.formatUnits(batchBalances[0], 18)}`,
      );
    } catch (error) {
      console.log(`❌ Error in batch balance check: ${error}`);
    }

    // Additional vault token information
    console.log("\n🔍 Additional Vault Information:");
    try {
      const vault = await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata",
        vaultToken,
      );
      const name = await vault.name();
      const symbol = await vault.symbol();
      const decimals = await vault.decimals();

      console.log(`📛 Vault Name: ${name}`);
      console.log(`🏷️  Vault Symbol: ${symbol}`);
      console.log(`🔢 Vault Decimals: ${decimals}`);
    } catch (error) {
      console.log(`⚠️  Could not get vault token info: ${error}`);
    }
  } catch (error) {
    console.log(`💥 Script execution failed: ${error}`);
    process.exit(1);
  }

  console.log("\n✅ Test completed successfully!");
}

// Handle both direct execution and being called from another script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main };
