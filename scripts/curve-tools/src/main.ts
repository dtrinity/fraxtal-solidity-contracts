import curve from "@curvefi/api";
import { fileURLToPath } from "url";

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl?: string;
  privateKey?: string;
  infuraNetwork?: string;
  infuraApiKey?: string;
  requiresFactoryFetch?: boolean;
}

const NETWORK_CONFIGS: { [key: string]: NetworkConfig } = {
  /* eslint-disable camelcase -- Naming convention is disabled for the pool names */
  fraxtal_testnet: {
    name: "Fraxtal Testnet",
    chainId: 2522,
    rpcUrl: "https://rpc.testnet.frax.com",
    privateKey: "3d3c83c453b40ed9fe6ebeaa527cb354bc526218e69185786a4953909fb54e63",
  },
  fraxtal_mainnet: {
    name: "Fraxtal Mainnet",
    chainId: 252, // TODO: Update with actual chain ID
    rpcUrl: "https://rpc.frax.com",
    privateKey: "3d3c83c453b40ed9fe6ebeaa527cb354bc526218e69185786a4953909fb54e63",
    requiresFactoryFetch: true,
  },
  ethereum_mainnet: {
    name: "Ethereum Mainnet",
    chainId: 1,
    infuraNetwork: "mainnet",
    infuraApiKey: "9c52fc4e27554e868b243c18bf9631c7",
    requiresFactoryFetch: true,
  },
  /* eslint-enable camelcase -- Re-enable naming convention at the end of the file */
};

/**
 * Initialize curve based on network selection
 *
 * @param network - The network to initialize
 */
async function initializeCurve(network: string): Promise<void> {
  const config = NETWORK_CONFIGS[network];

  if (!config) {
    throw new Error(`Unsupported network: ${network}. Supported networks: ${Object.keys(NETWORK_CONFIGS).join(", ")}`);
  }

  console.log(`Initializing curve on ${config.name}`);

  if (config.infuraNetwork) {
    console.log("Using Infura");
    // Initialize using Infura
    await curve.init(
      "Infura",
      {
        network: config.infuraNetwork,
        apiKey: config.infuraApiKey,
      },
      { chainId: config.chainId },
    );
  } else {
    console.log("Using JsonRpc");
    // Initialize using JsonRpc
    await curve.init(
      "JsonRpc",
      {
        url: config.rpcUrl!,
        ...(config.privateKey && { privateKey: config.privateKey }),
      },
      { chainId: config.chainId },
    );
  }

  // Fetch factory pools if required
  if (config.requiresFactoryFetch) {
    console.log("Fetching factory pools");
    await curve.factory.fetchPools();
    await curve.crvUSDFactory.fetchPools();
    await curve.EYWAFactory.fetchPools();
    await curve.cryptoFactory.fetchPools();
    await curve.twocryptoFactory.fetchPools();
    await curve.tricryptoFactory.fetchPools();
    await curve.stableNgFactory.fetchPools();

    console.log("Fetching new factory pools");
    await curve.factory.fetchNewPools();
    await curve.cryptoFactory.fetchNewPools();
    await curve.twocryptoFactory.fetchNewPools();
    await curve.tricryptoFactory.fetchNewPools();
    await curve.stableNgFactory.fetchNewPools();
  }
}

/**
 * Get best route arguments for a swap
 *
 * @param tokenIn - The token to swap from
 * @param tokenOut - The token to swap to
 * @param amountIn - The amount to swap
 * @param network - The network to initialize
 * @returns The best route arguments
 */
export async function getBestRouteArgs(tokenIn: string, tokenOut: string, amountIn: string, network: string): Promise<any> {
  await initializeCurve(network);

  console.log("Getting best route");
  const { route } = await curve.router.getBestRouteAndOutput(tokenIn, tokenOut, amountIn);

  return curve.router.getArgs(route);
}

// Check if this module is being run directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  console.log("Running directly from CLI");

  /**
   * Main function to get the best route arguments
   */
  async function main(): Promise<void> {
    if (process.argv.length < 6) {
      throw new Error("Usage: tsx main.ts <tokenIn> <tokenOut> <amountIn> <network>");
    }
    const tokenIn = process.argv[2];
    const tokenOut = process.argv[3];
    const amountIn = process.argv[4];
    const network = process.argv[5];

    if (!NETWORK_CONFIGS[network]) {
      throw new Error(`Invalid network. Supported networks: ${Object.keys(NETWORK_CONFIGS).join(", ")}`);
    }

    const args = await getBestRouteArgs(tokenIn, tokenOut, amountIn, network);
    console.log("Args: ", args);
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
