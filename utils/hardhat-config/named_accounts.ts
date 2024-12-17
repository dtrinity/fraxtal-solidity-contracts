import { ethers } from "ethers";

/**
 * Get the default private keys list for a specific network from the mnemonics in the `.env` file
 *
 * @param envNamePostfix - The postfix of the environment variable name (`MNEMONIC_<POSTFIX>`) in the `.env` file
 * @returns  The default private key
 */
export function getDefaultPrivateKeys(envNamePostfix: string): string[] {
  let pks = [
    getPrivateKeyFromMnemonic(`${envNamePostfix.toLowerCase()}_deployer`),
    getPrivateKeyFromMnemonic(`${envNamePostfix.toLowerCase()}_dex_pool_adder`),
    getPrivateKeyFromMnemonic(
      `${envNamePostfix.toLowerCase()}_lending_rewards_vault`,
    ),
  ];

  // Filter out Zero private keys
  pks = pks.filter(
    (pk) =>
      pk !==
      "0x0000000000000000000000000000000000000000000000000000000000000000",
  );

  if (pks.length === 0) {
    console.log(`No private keys found for ${envNamePostfix} in the .env file`);
    return [];
  }

  // Make sure there is no duplicated private key
  const uniquePks = Array.from(new Set(pks));

  if (uniquePks.length !== pks.length) {
    throw new Error(
      `Duplicated ${envNamePostfix} mnemonic detected in the .env file`,
    );
  }

  return pks;
}

/**
 * Get the private key by deriving it from the mnemonic in the `.env` file
 *
 * @param envNamePostfix - The postfix of the environment variable name (`MNEMONIC_<POSTFIX>`) in the `.env` file
 * @returns The default private key
 */
export function getPrivateKeyFromMnemonic(envNamePostfix: string): string {
  const mnemonicKey = "MNEMONIC_" + envNamePostfix.toUpperCase();
  const mnemonic = process.env[mnemonicKey];

  if (!mnemonic || mnemonic === "") {
    // We do not throw an error here to avoid blocking the localhost and local hardhat
    // as it will also need to initialize the hardhat.config.ts
    console.log(`${mnemonicKey} is not set in the .env file`);
    // Return a dummy private key in 32 bytes format to avoid breaking the compilation
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return wallet.privateKey;
}

/**
 * Get the default named accounts
 *
 * @returns The default named accounts
 */
export function getDefaultNamedAccounts(): {
  [name: string]:
    | string
    | number
    | {
        [network: string]: string | number | null;
      };
} {
  return {
    /* eslint-disable camelcase -- Use camelcase for network config  */
    // DEX
    dexDeployer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    dexLiquidityAdder: {
      hardhat: 1,
      localhost: 1,
      fraxtal_testnet: 1,
      fraxtal_mainnet: 1,
      local_ethereum: 1,
    },
    // Lending
    lendingDeployer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    lendingTreasuryOwner: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    lendingPoolAdmin: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    lendingAclAdmin: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    lendingEmergencyAdmin: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    // TODO: Remove this once we integrate incentive management with admin tool
    lendingIncentivesEmissionManager: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    // TODO: Remove this once we integrate incentive management with admin tool
    lendingIncentivesRewardsVault: {
      hardhat: 2,
      localhost: 2,
      fraxtal_testnet: 2,
      fraxtal_mainnet: 2,
      local_ethereum: 2,
    },
    lendingAddressesProviderRegistryOwner: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    liquidatorBotDeployer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    // dUSD v2
    // Lending
    dusdDeployer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    dusdCollateralWithdrawer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    dusdRecoverer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    dusdAmoTrader: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    // For local/testnet
    testTokenDeployer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      local_ethereum: 0,
    },
    testTokenOwner1: {
      hardhat: 1,
      localhost: 1,
      local_ethereum: 1,
    },
    testAccount1: {
      hardhat: 11,
      local_ethereum: 11,
    },
    testAccount2: {
      hardhat: 12,
      local_ethereum: 12,
    },
    testAccount3: {
      hardhat: 13,
      local_ethereum: 13,
    },
    // DLoop
    dloopDeployer: {
      hardhat: 0,
      localhost: 0,
      fraxtal_testnet: 0,
      fraxtal_mainnet: 0,
      local_ethereum: 0,
    },
    /* eslint-enable camelcase -- Use camelcase for network config */
  };
}
