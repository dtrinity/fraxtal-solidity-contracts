/**
 * Read-only proposal builder: FXB20551231 liquidation bonus 10500 -> 14000 on Fraxtal mainnet.
 *
 * Builds PoolConfigurator.configureReserveAsCollateral calldata, wraps it in the timelock
 * schedule() call, prints the Safe transaction proposal JSON (with safeTxHash for the current
 * on-chain nonce), and runs eth_call simulations. NEVER broadcasts or signs anything.
 *
 * Run: corepack yarn ts-node scripts/lending/reserve_configs/propose_fxb2055_liq_bonus.ts
 */
import fs from "fs";
import path from "path";

import { ethers } from "ethers";

const RPC_URL = process.env.FRAXTAL_RPC_URL ?? "https://rpc.frax.com";
const CHAIN_ID = 252;

const POOL_CONFIGURATOR = "0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7";
const GOVERNANCE_SAFE = "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9";
const TIMELOCK = "0x0bafaDA2a5824864720873EE40cd960b36445212";
const DATA_PROVIDER = "0xFB3adf4c845fD6352D24F3F0981eb7954401829c";
const FXB20551231 = "0xc38173D34afaEA88Bc482813B3CD267bc8A1EA83";

const NEW_LTV = 6000n;
const NEW_LIQUIDATION_THRESHOLD = 6500n;
const NEW_LIQUIDATION_BONUS = 14000n;

const TIMELOCK_DELAY = 86400n;
const SALT = ethers.id("fxb20551231-liquidation-bonus-40pct");

// The governance Safe is a GnosisSafe v1.3.0 fork whose bytecode does not expose
// getNonce()/nonce()/getTransactionHash(). The nonce lives in storage slot 5 of the
// canonical v1.3.0 layout (0 singleton, 2 owners, 3 ownerCount, 4 threshold, 5 nonce),
// verified against on-chain getOwners()/getThreshold().
const SAFE_NONCE_SLOT = 5;

const configuratorIface = new ethers.Interface([
  "function configureReserveAsCollateral(address asset, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus)",
]);
const timelockIface = new ethers.Interface([
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function getMinDelay() view returns (uint256)",
]);
const safeIface = new ethers.Interface([
  "function domainSeparator() view returns (bytes32)",
  "function getThreshold() view returns (uint256)",
]);
const dataProviderIface = new ethers.Interface([
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
]);

const SAFE_TX_TYPEHASH = ethers.id(
  "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)",
);
const DOMAIN_TYPEHASH = ethers.id("EIP712Domain(uint256 chainId,address verifyingContract)");

function computeSafeTxHash(
  domainSeparator: string,
  to: string,
  value: bigint,
  data: string,
  nonce: bigint,
): string {
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "address", "uint256", "bytes32", "uint8", "uint256", "uint256", "uint256", "address", "address", "uint256"],
      [
        SAFE_TX_TYPEHASH,
        to,
        value,
        ethers.keccak256(data),
        0,
        0n,
        0n,
        0n,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        nonce,
      ],
    ),
  );
  return ethers.solidityPackedKeccak256(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", domainSeparator, structHash]);
}

async function simulate(provider: ethers.JsonRpcProvider, label: string, from: string, to: string, data: string): Promise<boolean> {
  try {
    await provider.call({ from, to, data });
    console.log(`  [simulation OK]   ${label}`);
    return true;
  } catch (error) {
    console.log(`  [simulation FAIL] ${label}: ${JSON.stringify((error as ethers.EthersError).info?.error ?? (error as Error).message)}`);
    return false;
  }
}

const main = async (): Promise<void> => {
  const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
  const blockNumber = await provider.getBlockNumber();

  const currentConfigRaw = await provider.call({
    to: DATA_PROVIDER,
    data: dataProviderIface.encodeFunctionData("getReserveConfigurationData", [FXB20551231]),
  });
  const currentConfig = dataProviderIface.decodeFunctionResult("getReserveConfigurationData", currentConfigRaw);
  if (
    currentConfig[1] !== NEW_LTV ||
    currentConfig[2] !== NEW_LIQUIDATION_THRESHOLD ||
    currentConfig[3] !== 10500n
  ) {
    throw new Error(
      `Unexpected current config for FXB20551231: ltv=${currentConfig[1]} lt=${currentConfig[2]} bonus=${currentConfig[3]}`,
    );
  }
  console.log("Current FXB20551231 config (data provider):");
  console.log(`  ltv=${currentConfig[1]} liquidationThreshold=${currentConfig[2]} liquidationBonus=${currentConfig[3]} reserveFactor=${currentConfig[4]}`);

  const minDelayRaw = await provider.call({ to: TIMELOCK, data: timelockIface.encodeFunctionData("getMinDelay") });
  const minDelay = BigInt(minDelayRaw);
  if (TIMELOCK_DELAY < minDelay) {
    throw new Error(`TIMELOCK_DELAY ${TIMELOCK_DELAY} below timelock minDelay ${minDelay}`);
  }

  const innerData = configuratorIface.encodeFunctionData("configureReserveAsCollateral", [
    FXB20551231,
    NEW_LTV,
    NEW_LIQUIDATION_THRESHOLD,
    NEW_LIQUIDATION_BONUS,
  ]);
  const scheduleData = timelockIface.encodeFunctionData("schedule", [
    POOL_CONFIGURATOR,
    0n,
    innerData,
    ethers.ZeroHash,
    SALT,
    TIMELOCK_DELAY,
  ]);

  const domainSeparator = await provider.call({ to: GOVERNANCE_SAFE, data: safeIface.encodeFunctionData("domainSeparator") });
  const expectedDomain = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256", "address"],
      [DOMAIN_TYPEHASH, BigInt(CHAIN_ID), GOVERNANCE_SAFE],
    ),
  );
  if (domainSeparator !== expectedDomain) {
    throw new Error(`Safe domainSeparator ${domainSeparator} != expected ${expectedDomain}`);
  }
  const thresholdRaw = await provider.call({ to: GOVERNANCE_SAFE, data: safeIface.encodeFunctionData("getThreshold") });
  const threshold = BigInt(thresholdRaw);
  const nonce = BigInt(await provider.getStorage(GOVERNANCE_SAFE, SAFE_NONCE_SLOT));

  const safeTxHash = computeSafeTxHash(domainSeparator, TIMELOCK, 0n, scheduleData, nonce);

  console.log("\nSimulations (read-only eth_call):");
  const scheduleOk = await simulate(
    provider,
    `timelock.schedule(FXB20551231 bonus 14000) from Safe ${GOVERNANCE_SAFE}`,
    GOVERNANCE_SAFE,
    TIMELOCK,
    scheduleData,
  );
  const innerOk = await simulate(
    provider,
    `configureReserveAsCollateral(FXB20551231, 6000, 6500, 14000) from timelock ${TIMELOCK}`,
    TIMELOCK,
    POOL_CONFIGURATOR,
    innerData,
  );

  const safeTx = {
    to: TIMELOCK.toLowerCase(),
    value: "0",
    data: scheduleData,
    operation: 0,
  };

  const proposal = {
    version: "1.0",
    chainId: CHAIN_ID,
    createdAt: new Date().toISOString(),
    createdAtBlock: blockNumber,
    description: "FXB20551231: raise liquidation bonus 10500 -> 14000 (5% -> 40% liquidation penalty) on Fraxtal mainnet",
    safe: {
      safeAddress: GOVERNANCE_SAFE,
      threshold: threshold.toString(),
      nonce: nonce.toString(),
      domainSeparator,
      safeTxHash,
      transaction: safeTx,
    },
    timelock: {
      timelockAddress: TIMELOCK,
      minDelay: minDelay.toString(),
      delay: TIMELOCK_DELAY.toString(),
      salt: SALT,
      predecessor: ethers.ZeroHash,
    },
    innerCall: {
      to: POOL_CONFIGURATOR,
      function: "configureReserveAsCollateral(address,uint256,uint256,uint256)",
      args: {
        asset: FXB20551231,
        ltv: NEW_LTV.toString(),
        liquidationThreshold: NEW_LIQUIDATION_THRESHOLD.toString(),
        liquidationBonus: NEW_LIQUIDATION_BONUS.toString(),
      },
      decoded: configuratorIface.parseTransaction({ data: innerData })?.args.map(String),
      data: innerData,
    },
    currentConfig: {
      ltv: currentConfig[1].toString(),
      liquidationThreshold: currentConfig[2].toString(),
      liquidationBonus: currentConfig[3].toString(),
      reserveFactor: currentConfig[4].toString(),
      usageAsCollateralEnabled: currentConfig[5],
      isActive: currentConfig[8],
    },
    simulations: {
      scheduleFromSafe: scheduleOk,
      innerCallFromTimelock: innerOk,
    },
    notes: [
      "liquidationProtocolFee stays at its current 7000 (70%); configureReserveAsCollateral on this deployment takes 4 args and does not touch the fee.",
      "The governance Safe is a GnosisSafe 1.3.0 fork without getNonce(); nonce is read from storage slot 5.",
      "safeTxHash is invalidated if any other Safe transaction executes first (nonce bump); re-run the script to regenerate.",
      "Requires 3-of-5 owner signatures (on-chain threshold), then wait 86400s after schedule() before timelock execute().",
    ],
  };

  console.log("\nSafe transaction proposal:");
  console.log(JSON.stringify(proposal, null, 2));

  const outDir = path.join(__dirname, "..", "..", "..", "reports", "governance");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "fraxtal-mainnet-fxb2055-liq-bonus-40pct.json");
  fs.writeFileSync(outFile, JSON.stringify(proposal, null, 2) + "\n");
  console.log(`\nWritten: ${outFile}`);

  if (!scheduleOk || !innerOk) {
    process.exitCode = 1;
  }
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
