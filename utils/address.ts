import { getAddress, isAddress, ZeroAddress } from "ethers";

/**
 * Check if two addresses are equal
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/helpers/utilities/utils.ts#L29
 *
 * @param a - address a
 * @param b - address b
 * @returns `true` if the addresses are equal, `false` otherwise
 */
export function isEqualAddress(a: string, b: string): boolean {
  return getAddress(a) === getAddress(b);
}

/**
 * Check if the given value is a valid address
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/helpers/utilities/utils.ts#L5
 *
 * @param value - The address to check
 * @returns `true` if the address is valid, `false` otherwise
 */
export function isValidAddress(value: string): boolean {
  return (
    !!value && isAddress(value) && getAddress(value) !== getAddress(ZeroAddress)
  );
}
