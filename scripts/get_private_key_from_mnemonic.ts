import { ethers } from "ethers";
import { parse } from "ts-command-line-args";

export const args = parse<{
  mnemonic: string;
  help?: boolean;
}>(
  {
    mnemonic: {
      type: String,
      description: "The mnemonic",
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
        header: "Get Private Key from Mnemonic",
        content: "This script gets the private key from a mnemonic.",
      },
    ],
  },
);

/**
 * Get private key from mnemonic
 */
async function main(): Promise<void> {
  const mnemonic = args.mnemonic;

  if (!mnemonic) {
    throw new Error("Mnemonic is required");
  }

  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  console.log("Private key:", wallet.privateKey);
  console.log("Address:", wallet.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
