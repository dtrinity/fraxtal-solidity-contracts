import { ethers } from "ethers";

interface ErrorDefinition {
  name: string;
  params: string[];
  decode: (data: string) => {
    name: string;
    args: {
      router?: string;
      currentAllowance?: bigint;
      requiredAmount?: bigint;
      expected?: bigint;
      actual?: bigint;
    };
  };
}

interface ErrorSignatures {
  [key: string]: ErrorDefinition;
}

const ERROR_SIGNATURES: ErrorSignatures = {
  "0xfb8f41b2": {
    name: "InsufficientAllowance",
    params: ["address", "uint256", "uint256"],
    decode: function (data: string) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        this.params,
        "0x" + data.slice(10), // Remove the error selector
      );
      return {
        name: this.name,
        args: {
          router: decoded[0],
          currentAllowance: decoded[1],
          requiredAmount: decoded[2],
        },
      };
    },
  },
  "0x7c1b66a3": {
    name: "SwapFailed",
    params: [],
    decode: function (_data: string) {
      return {
        name: this.name,
        args: {},
      };
    },
  },
  "0x2c19b8b8": {
    name: "InsufficientOutput",
    params: ["uint256", "uint256"],
    decode: function (data: string) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        this.params,
        "0x" + data.slice(10),
      );
      return {
        name: this.name,
        args: {
          expected: decoded[0],
          actual: decoded[1],
        },
      };
    },
  },
  // Add more error signatures as needed
};

/**
 * Decodes a custom error from an Ethereum transaction
 *
 * @param error - The error object containing data to decode
 * @returns {object|null} The decoded error information or null if no error data is present
 */
export function decodeCustomError(error: any): {
  name?: string;
  selector?: string;
  message?: string;
  args?: {
    router?: string;
    currentAllowance?: bigint;
    requiredAmount?: bigint;
    expected?: bigint;
    actual?: bigint;
  };
  data?: string;
} | null {
  if (!error.data) return null;

  const errorSelector = error.data.slice(0, 10); // First 4 bytes including 0x
  const errorDef = ERROR_SIGNATURES[errorSelector];

  if (!errorDef) {
    return {
      selector: errorSelector,
      message: "Unknown error signature",
      data: error.data,
    };
  }

  return errorDef.decode(error.data);
}
