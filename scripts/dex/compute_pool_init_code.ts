import { keccak256 } from "@ethersproject/solidity";

/**
 * Main function that computes the init code hash of the UniswapV3Pool contract
 * - Reference: https://ethereum.stackexchange.com/a/107643
 */
async function main(): Promise<void> {
  const poolContract = require("../../artifacts/contracts/dex/core/UniswapV3Pool.sol/UniswapV3Pool.json");
  const poolInitCodeHash = keccak256(["bytes"], [`${poolContract.bytecode}`]);
  console.log("POOL_INIT_CODE_HASH:", poolInitCodeHash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
