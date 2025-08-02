import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getConfig } from "../config/config";
import { isLocalNetwork } from "./utils";

// Re-export types for convenience
export { TokenRegistryConfig } from "../config/types";

/**
 * Token deployment strategies
 */
export enum TokenDeploymentStrategy {
  /** Token with pre-minted supply (configured in mintInfos) */
  MINT = "mint",
  /** Token deployed without pre-minted supply */
  DEPLOY_ONLY = "deploy-only",
  /** External token (not deployed by us) */
  EXTERNAL = "external",
}

/**
 * Token registry entry
 */
export interface TokenRegistryEntry {
  /** Token symbol */
  symbol: string;
  /** Deployment strategy */
  strategy: TokenDeploymentStrategy;
  /** Token address (for external tokens or overrides) */
  address?: string;
  /** Alternative symbols/aliases */
  aliases?: string[];
}

/**
 * Token registry configuration
 */
export interface TokenRegistry {
  /** Tokens indexed by symbol */
  tokens: { [symbol: string]: TokenRegistryEntry };
}

/**
 * Default token registry for known tokens
 */
const DEFAULT_TOKEN_REGISTRY: { [symbol: string]: Omit<TokenRegistryEntry, "symbol"> } = {
  // Production stablecoin deployed without pre-minted supply
  dUSD: {
    strategy: TokenDeploymentStrategy.DEPLOY_ONLY,
    aliases: ["dusd", "DUSD"],
  },
  // Legacy test token with pre-minted supply (when present in mintInfos)
  DUSD: {
    strategy: TokenDeploymentStrategy.MINT,
    aliases: ["dusd"],
  },
  // Other tokens can be added here as needed
};

/**
 * Get the token registry for a network
 * @param hre - Hardhat Runtime Environment
 * @returns Token registry
 */
export async function getTokenRegistry(
  hre: HardhatRuntimeEnvironment,
): Promise<TokenRegistry> {
  const config = await getConfig(hre);
  const registry: TokenRegistry = { tokens: {} };

  // Apply configuration overrides first if they exist
  if (config.tokenRegistry?.tokens) {
    for (const [symbol, entry] of Object.entries(config.tokenRegistry.tokens)) {
      registry.tokens[symbol] = {
        symbol,
        strategy: entry.strategy as TokenDeploymentStrategy,
        address: entry.address,
        aliases: entry.aliases,
      };
    }
  }

  // Build registry from configuration
  if (isLocalNetwork(hre.network.name)) {
    // Add tokens from mintInfos (if not already in registry)
    if (config.mintInfos) {
      for (const symbol of Object.keys(config.mintInfos)) {
        if (!registry.tokens[symbol]) {
          registry.tokens[symbol] = {
            ...(DEFAULT_TOKEN_REGISTRY[symbol] || {}),
            symbol,
            strategy: TokenDeploymentStrategy.MINT,
          };
        }
      }
    }

    // Add deploy-only tokens (if not already in registry)
    for (const [symbol, entry] of Object.entries(DEFAULT_TOKEN_REGISTRY)) {
      if (entry.strategy === TokenDeploymentStrategy.DEPLOY_ONLY && !registry.tokens[symbol]) {
        registry.tokens[symbol] = {
          symbol,
          ...entry,
        };
      }
    }
  } else {
    // For non-local networks, use reserveAssetAddresses (if not already in registry)
    if (config.lending.reserveAssetAddresses) {
      for (const [symbol, address] of Object.entries(config.lending.reserveAssetAddresses)) {
        if (!registry.tokens[symbol]) {
          registry.tokens[symbol] = {
            ...(DEFAULT_TOKEN_REGISTRY[symbol] || {}),
            symbol,
            strategy: TokenDeploymentStrategy.EXTERNAL,
            address,
          };
        }
      }
    }
  }

  return registry;
}

/**
 * Get all token addresses from the registry
 * @param hre - Hardhat Runtime Environment
 * @returns Map of token symbols to addresses
 */
export async function getTokenAddresses(
  hre: HardhatRuntimeEnvironment,
): Promise<{ [symbol: string]: string }> {
  const registry = await getTokenRegistry(hre);
  const addresses: { [symbol: string]: string } = {};

  for (const [symbol, entry] of Object.entries(registry.tokens)) {
    // Try to get address from deployment or configuration
    let address: string | undefined;

    if (entry.address) {
      // Use provided address
      address = entry.address;
    } else if (isLocalNetwork(hre.network.name)) {
      // Try to get from deployments
      const deployment = await hre.deployments.getOrNull(symbol);
      if (deployment) {
        address = deployment.address;
      }
    }

    if (address) {
      // Add main symbol
      addresses[symbol] = address;

      // Add aliases
      if (entry.aliases) {
        for (const alias of entry.aliases) {
          addresses[alias] = address;
        }
      }
    }
  }

  return addresses;
}

/**
 * Get a specific token address by symbol
 * @param hre - Hardhat Runtime Environment
 * @param symbol - Token symbol
 * @returns Token address or undefined if not found
 */
export async function getTokenAddress(
  hre: HardhatRuntimeEnvironment,
  symbol: string,
): Promise<string | undefined> {
  const addresses = await getTokenAddresses(hre);
  return addresses[symbol];
}

/**
 * Check if a token exists in the registry
 * @param hre - Hardhat Runtime Environment
 * @param symbol - Token symbol
 * @returns True if token exists
 */
export async function hasToken(
  hre: HardhatRuntimeEnvironment,
  symbol: string,
): Promise<boolean> {
  const addresses = await getTokenAddresses(hre);
  return symbol in addresses;
}