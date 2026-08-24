import { Provider, ZeroAddress, dataSlice, getAddress } from "ethers";

const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const DEFAULT_RESERVE_SYMBOLS = ["dUSD"];

export const DIRECTIONAL_ROUNDING_UPGRADE_TAG = "dlend-directional-rounding";
export const DIRECTIONAL_ROUNDING_POOL_IMPL_ID = "L2Pool-Implementation-DirectionalRounding";
export const DIRECTIONAL_ROUNDING_ATOKEN_IMPL_ID = "AToken-dTrinity-Lend-DirectionalRounding";
export const DIRECTIONAL_ROUNDING_VARIABLE_DEBT_TOKEN_IMPL_ID = "VariableDebtToken-dTrinity-Lend-DirectionalRounding";
export const DIRECTIONAL_ROUNDING_TOKEN_INIT_PARAMS = "0x10";

export interface DirectionalRoundingReserve {
  symbol: string;
  asset: string;
}

export function getDirectionalRoundingReserveSymbols(): string[] {
  const rawSymbols = process.env.DLEND_DIRECTIONAL_ROUNDING_ASSETS;

  if (!rawSymbols) {
    return DEFAULT_RESERVE_SYMBOLS;
  }

  const symbols = rawSymbols
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    throw new Error("DLEND_DIRECTIONAL_ROUNDING_ASSETS is set but no reserve symbols were provided");
  }

  return Array.from(new Set(symbols));
}

export function resolveDirectionalRoundingReserves(reserveAssetAddresses: Record<string, string>): DirectionalRoundingReserve[] {
  return getDirectionalRoundingReserveSymbols().map((symbol) => {
    const asset = reserveAssetAddresses[symbol];

    if (!asset) {
      throw new Error(`Reserve symbol ${symbol} is not configured for this network`);
    }

    return { symbol, asset };
  });
}

export async function readProxyImplementation(provider: Provider, proxyAddress: string): Promise<string> {
  const rawValue = await provider.getStorage(proxyAddress, IMPLEMENTATION_SLOT);

  if (rawValue === "0x") {
    return ZeroAddress;
  }

  return getAddress(dataSlice(rawValue, 12));
}
