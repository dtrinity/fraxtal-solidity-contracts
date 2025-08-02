import hre from "hardhat";

// USD's decimals used by AaveOracle
export const AAVE_ORACLE_USD_DECIMALS = 8;

// State directory path
export const STATE_DIR_PATH = `./state/${hre.network.name}`;

// User state directory name
export const USER_STATE_DIR_NAME = "user-state";

// Reference: contracts/shared/Constants.sol
export const ONE_BPS_UNIT = 100; // 1 bps with 2 decimals
export const ONE_PERCENT_BPS = 100 * ONE_BPS_UNIT; // 1% in basis points
export const ONE_HUNDRED_PERCENT_BPS = 100 * ONE_PERCENT_BPS; // 100% in basis points