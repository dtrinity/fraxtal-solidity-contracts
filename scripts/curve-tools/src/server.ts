import { ethers } from "ethers";
import express from "express";

import { getBestRouteArgs } from "./main";

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;

interface RouteRequest {
  inputTokenAddress: string;
  outputTokenAddress: string;
  inputAmount: string;
  network: string;
}

// Network configurations
const NETWORK_CONFIGS = {
  /* eslint-disable camelcase -- Naming convention is disabled for the pool names */
  mainnet: {
    name: "Ethereum Mainnet",
    chainId: 1,
    rpcUrl: "https://mainnet.infura.io/v3/your-api-key",
  },
  arbitrum: {
    name: "Arbitrum One",
    chainId: 42161,
    rpcUrl: "https://arbitrum-mainnet.infura.io/v3/your-api-key",
  },
  optimism: {
    name: "Optimism",
    chainId: 10,
    rpcUrl: "https://optimism-mainnet.infura.io/v3/your-api-key",
  },
  base: {
    name: "Base",
    chainId: 8453,
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/your-api-key",
  },
  fraxtal_mainnet: {
    name: "Fraxtal Mainnet",
    chainId: 252,
    rpcUrl: "https://rpc.frax.com",
  },
  fraxtal_testnet: {
    name: "Fraxtal Testnet",
    chainId: 2522,
    rpcUrl: "https://rpc.testnet.frax.com",
  },
  /* eslint-enable camelcase -- Re-enable naming convention at the end of the file */
};

/**
 * Get the decimals of a token
 *
 * @param provider - The provider to use
 * @param tokenAddress - The address of the token
 * @returns The decimals of the token
 */
export async function getTokenDecimals(provider: ethers.Provider, tokenAddress: string): Promise<number> {
  const tokenContract = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], provider);
  return await tokenContract.decimals();
}

app.post("/get-best-route-args", async (req, res) => {
  try {
    const { inputTokenAddress, outputTokenAddress, inputAmount, network } = req.body as RouteRequest;

    if (!inputTokenAddress || !outputTokenAddress || !inputAmount || !network) {
      return res.status(400).json({
        error: "Missing required parameters: inputTokenAddress, outputTokenAddress, inputAmount, or network",
      });
    }

    if (!NETWORK_CONFIGS[network]) {
      return res.status(400).json({
        error: `Invalid network. Supported networks: ${Object.keys(NETWORK_CONFIGS).join(", ")}`,
      });
    }

    const args = await getBestRouteArgs(inputTokenAddress, outputTokenAddress, inputAmount, network);

    res.json(args);
  } catch (error) {
    console.error("Error getting route args:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
