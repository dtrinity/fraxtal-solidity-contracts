import { ethers } from "ethers";
import { parse } from "ts-command-line-args";

/**
 * Arguments for the script
 */
export const args = parse<{
  privateKey: string;
  help?: boolean;
}>(
  {
    privateKey: {
      type: String,
      description: "The private key",
    },
    help: {
      type: Boolean,
      optional: true,
      alias: "h",
      description: "Prints this usage guide",
    },
  },
  {
    helpArg: "help",
    headerContentSections: [
      {
        header: "Get Wallet Address from Private Key",
        content: "This script gets the wallet address from a private key.",
      },
    ],
  },
);

/**
 * Get wallet address from private key
 *
 * Usage:
 *  yarn ts-node scripts/get_wallet_address_from_pk.ts --privateKey=<privateKey>
 */
async function main(): Promise<void> {
  const privateKey = args.privateKey;

  if (!privateKey) {
    throw new Error("Private key is required");
  }

  const wallet = new ethers.Wallet(privateKey);
  console.log("Address:", wallet.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
