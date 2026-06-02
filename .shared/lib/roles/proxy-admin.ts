import { getAddress } from "@ethersproject/address";
import { AbiItem } from "web3-utils";

/**
 * Aave / dLEND AdminUpgradeabilityProxy admin slot
 * (keccak256("eip1967.proxy.admin") - 1 per BaseAdminUpgradeabilityProxy).
 */
export const AAVE_PROXY_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

type FunctionAbiItem = AbiItem & {
  readonly type: "function";
  readonly name: string;
  readonly inputs?: { readonly type: string }[];
};

function isAbiFunctionFragment(item: AbiItem): item is FunctionAbiItem {
  const fragment = item as { type?: string; name?: unknown };
  return fragment.type === "function" && typeof fragment.name === "string";
}

export function detectProxyAdminFragment(abi: AbiItem[]): FunctionAbiItem | undefined {
  return abi.find(
    (item): item is FunctionAbiItem =>
      isAbiFunctionFragment(item) &&
      item.name === "changeAdmin" &&
      (item.inputs?.length ?? 0) === 1 &&
      item.inputs?.[0].type === "address",
  );
}

export function parseAddressFromStorageSlot(slotValue: string): string {
  const hex = slotValue.startsWith("0x") ? slotValue.slice(2) : slotValue;
  const padded = hex.padStart(64, "0");
  return getAddress(`0x${padded.slice(-40)}`);
}

export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

export async function readProxyAdminFromStorage(
  provider: { getStorage: (address: string, slot: string) => Promise<string> },
  proxyAddress: string,
): Promise<string | null> {
  const raw = await provider.getStorage(proxyAddress, AAVE_PROXY_ADMIN_SLOT);
  const admin = parseAddressFromStorageSlot(raw);
  if (isZeroAddress(admin)) {
    return null;
  }
  return admin;
}
