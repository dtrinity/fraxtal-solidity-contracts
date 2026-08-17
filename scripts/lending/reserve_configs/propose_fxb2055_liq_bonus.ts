/**
 * Read-only proposal builder: FXB20551231 liquidation bonus 10500 -> 14000 on Fraxtal mainnet,
 * plus on-chain liquidationProtocolFee handling.
 *
 * IMPORTANT FINDING (2026-08-17): the on-chain liquidationProtocolFee for FXB20551231 is 0
 * (read from Pool.getConfiguration packed map, bits 152-167), NOT 7000 as the repo deploy
 * config suggests. The same is true for dUSD and sfrxUSD. Therefore scheduling
 * setLiquidationProtocolFee(FXB, 1500) would RAISE the fee from 0 to 1500 and REDUCE the
 * liquidator's share of the penalty from 100% to 85% - the opposite of the stated intent.
 *
 * This script therefore:
 *  - if on-chain fee == 0: schedules ONLY configureReserveAsCollateral(FXB, 6000, 6500, 14000)
 *    and emits a fully pre-built, simulated but NOT-scheduled optional fee leg
 *    setLiquidationProtocolFee(FXB, 1500) for governance to use only if it deliberately
 *    wants a protocol share of the penalty;
 *  - if on-chain fee == 7000 (the scenario the original task assumed): emits TWO sequential
 *    Safe transactions (nonce N: bonus schedule; nonce N+1: fee schedule), because one Safe
 *    tx carries one call and no MultiSend deployment is verified on Fraxtal;
 *  - any other nonzero fee: aborts and asks a human to decide.
 *
 * It never broadcasts or signs anything. Output: reports/governance/
 * fraxtal-mainnet-fxb2055-liq-bonus-40pct.json plus read-only eth_call simulations.
 *
 * Run: corepack yarn ts-node scripts/lending/reserve_configs/propose_fxb2055_liq_bonus.ts
 *   or: ./node_modules/.bin/ts-node scripts/lending/reserve_configs/propose_fxb2055_liq_bonus.ts
 */
import fs from "fs";
import path from "path";

import { ethers } from "ethers";

const RPC_URL = process.env.FRAXTAL_RPC_URL ?? "https://rpc.frax.com";
const CHAIN_ID = 252;

const POOL = "0xD76C827Ee2Ce1E37c37Fc2ce91376812d3c9BCE2";
const POOL_CONFIGURATOR = "0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7";
const GOVERNANCE_SAFE = "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9";
const TIMELOCK = "0x0bafaDA2a5824864720873EE40cd960b36445212";
const DATA_PROVIDER = "0xFB3adf4c845fD6352D24F3F0981eb7954401829c";
const FXB20551231 = "0xc38173D34afaEA88Bc482813B3CD267bc8A1EA83";

const NEW_LTV = 6000n;
const NEW_LIQUIDATION_THRESHOLD = 6500n;
const NEW_LIQUIDATION_BONUS = 14000n;
const OPTIONAL_NEW_LIQUIDATION_PROTOCOL_FEE = 1500n; // only used if governance opts in

const TIMELOCK_DELAY = 86400n;
const BONUS_SALT = ethers.id("fxb20551231-liquidation-bonus-40pct");
const FEE_SALT = ethers.id("fxb20551231-liquidation-protocol-fee-1500");

// The governance Safe is a GnosisSafe v1.3.0 fork whose bytecode does not expose
// getNonce()/nonce()/getTransactionHash(). The canonical v1.3.0 storage layout is:
// slot 0 singleton, slot 1 modules, slot 2 owners, slot 3 ownerCount, slot 4 threshold,
// slot 5 nonce. The script cross-checks slots 3/4 against getOwners()/getThreshold().
const SAFE_OWNER_COUNT_SLOT = 3;
const SAFE_THRESHOLD_SLOT = 4;
const SAFE_NONCE_SLOT = 5;

// ReserveConfiguration.sol packing (this repo's lending core)
const LIQ_PROTOCOL_FEE_START = 152n;
const LIQ_PROTOCOL_FEE_BITS = 16n;

const configuratorIface = new ethers.Interface([
  "function configureReserveAsCollateral(address asset, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus)",
  "function setLiquidationProtocolFee(address asset, uint256 newFee)",
]);
const poolIface = new ethers.Interface(["function getConfiguration(address asset) view returns (uint256)"]);
const timelockIface = new ethers.Interface([
  "function schedule(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
  "function execute(address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt)",
  "function getMinDelay() view returns (uint256)",
]);
const safeIface = new ethers.Interface([
  "function domainSeparator() view returns (bytes32)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
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

function extractLiqProtocolFee(packed: bigint): bigint {
  const mask = (1n << LIQ_PROTOCOL_FEE_BITS) - 1n;
  return (packed >> LIQ_PROTOCOL_FEE_START) & mask;
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

  const packedRaw = await provider.call({ to: POOL, data: poolIface.encodeFunctionData("getConfiguration", [FXB20551231]) });
  const onChainLiqFee = extractLiqProtocolFee(BigInt(packedRaw));
  console.log(`On-chain liquidationProtocolFee (Pool.getConfiguration bits 152-167): ${onChainLiqFee}`);

  const minDelayRaw = await provider.call({ to: TIMELOCK, data: timelockIface.encodeFunctionData("getMinDelay") });
  const minDelay = BigInt(minDelayRaw);
  if (TIMELOCK_DELAY < minDelay) {
    throw new Error(`TIMELOCK_DELAY ${TIMELOCK_DELAY} below timelock minDelay ${minDelay}`);
  }

  // ---- Safe identity / nonce proof ----
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
  const threshold = BigInt(await provider.call({ to: GOVERNANCE_SAFE, data: safeIface.encodeFunctionData("getThreshold") }));
  const owners = safeIface.decodeFunctionResult(
    "getOwners",
    await provider.call({ to: GOVERNANCE_SAFE, data: safeIface.encodeFunctionData("getOwners") }),
  )[0] as string[];
  const ownerCountSlot = BigInt(await provider.getStorage(GOVERNANCE_SAFE, SAFE_OWNER_COUNT_SLOT));
  const thresholdSlot = BigInt(await provider.getStorage(GOVERNANCE_SAFE, SAFE_THRESHOLD_SLOT));
  const nonce = BigInt(await provider.getStorage(GOVERNANCE_SAFE, SAFE_NONCE_SLOT));
  if (ownerCountSlot !== BigInt(owners.length) || thresholdSlot !== threshold) {
    throw new Error(
      `Storage layout mismatch: slot3(ownerCount)=${ownerCountSlot} vs getOwners=${owners.length}, slot4(threshold)=${thresholdSlot} vs getThreshold=${threshold} - nonce slot read untrustworthy`,
    );
  }
  console.log(`\nSafe ${GOVERNANCE_SAFE}: threshold=${threshold} owners=${owners.length} nonce(slot5)=${nonce} @ block ${blockNumber}`);
  console.log("Owners:");
  for (const o of owners) console.log(`  ${o}`);

  // ---- Build calldata ----
  const bonusInnerData = configuratorIface.encodeFunctionData("configureReserveAsCollateral", [
    FXB20551231,
    NEW_LTV,
    NEW_LIQUIDATION_THRESHOLD,
    NEW_LIQUIDATION_BONUS,
  ]);
  const bonusScheduleData = timelockIface.encodeFunctionData("schedule", [
    POOL_CONFIGURATOR,
    0n,
    bonusInnerData,
    ethers.ZeroHash,
    BONUS_SALT,
    TIMELOCK_DELAY,
  ]);
  const bonusExecuteData = timelockIface.encodeFunctionData("execute", [
    POOL_CONFIGURATOR,
    0n,
    bonusInnerData,
    ethers.ZeroHash,
    BONUS_SALT,
  ]);

  const feeInnerData = configuratorIface.encodeFunctionData("setLiquidationProtocolFee", [
    FXB20551231,
    OPTIONAL_NEW_LIQUIDATION_PROTOCOL_FEE,
  ]);
  const feeScheduleData = timelockIface.encodeFunctionData("schedule", [
    POOL_CONFIGURATOR,
    0n,
    feeInnerData,
    ethers.ZeroHash,
    FEE_SALT,
    TIMELOCK_DELAY,
  ]);
  const feeExecuteData = timelockIface.encodeFunctionData("execute", [
    POOL_CONFIGURATOR,
    0n,
    feeInnerData,
    ethers.ZeroHash,
    FEE_SALT,
  ]);

  // ---- Fee strategy branch ----
  let scheduleFeeLeg = false;
  if (onChainLiqFee === 0n) {
    console.log(
      "\nOn-chain fee is 0: liquidators currently keep 100% of the penalty. Setting 1500 would RAISE the fee and cut the liquidator share to 85% - against the intent of 'give liquidators more'. Fee leg is prepared but NOT scheduled by default.",
    );
  } else if (onChainLiqFee === 7000n) {
    scheduleFeeLeg = true;
    console.log("\nOn-chain fee is 7000 as originally assumed: scheduling BOTH legs sequentially (bonus @ nonce N, fee @ nonce N+1).");
  } else {
    throw new Error(
      `On-chain liquidationProtocolFee is ${onChainLiqFee} (expected 0 or 7000). Aborting - a human must decide the new fee value before this payload is generated.`,
    );
  }

  const bonusSafeTxHash = computeSafeTxHash(domainSeparator, TIMELOCK, 0n, bonusScheduleData, nonce);
  const feeSafeTxHash = computeSafeTxHash(domainSeparator, TIMELOCK, 0n, feeScheduleData, nonce + 1n);

  // ---- Simulations (read-only eth_call) ----
  console.log("\nSimulations (read-only eth_call):");
  const bonusScheduleOk = await simulate(
    provider,
    `timelock.schedule(FXB20551231 bonus 14000) from Safe ${GOVERNANCE_SAFE}`,
    GOVERNANCE_SAFE,
    TIMELOCK,
    bonusScheduleData,
  );
  const bonusInnerOk = await simulate(
    provider,
    `configureReserveAsCollateral(FXB20551231, 6000, 6500, 14000) from timelock ${TIMELOCK}`,
    TIMELOCK,
    POOL_CONFIGURATOR,
    bonusInnerData,
  );
  const feeScheduleOk = await simulate(
    provider,
    `timelock.schedule(setLiquidationProtocolFee 1500) from Safe ${GOVERNANCE_SAFE}`,
    GOVERNANCE_SAFE,
    TIMELOCK,
    feeScheduleData,
  );
  const feeInnerOk = await simulate(
    provider,
    `setLiquidationProtocolFee(FXB20551231, 1500) from timelock ${TIMELOCK}`,
    TIMELOCK,
    POOL_CONFIGURATOR,
    feeInnerData,
  );

  // Full execTransaction simulation with dummy owner signatures. GnosisSafe requires valid
  // threshold signatures even in eth_call, and we hold no owner keys, so this is expected to
  // revert at checkSignatures on a public RPC - we attempt it anyway and record the outcome.
  let execSimulation = "not-attempted";
  try {
    const sortedOwners = [...owners].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const dummySigs = "0x" + sortedOwners.slice(0, Number(threshold)).map((o) => o.toLowerCase().replace("0x", "").padEnd(64, "0") + "0".repeat(64) + "00").join("");
    await provider.call({
      from: sortedOwners[0],
      to: GOVERNANCE_SAFE,
      data: safeIface.encodeFunctionData("execTransaction", [
        TIMELOCK, 0n, bonusScheduleData, 0, 0n, 0n, 0n, ethers.ZeroAddress, ethers.ZeroAddress, dummySigs,
      ]),
      value: 0n,
    });
    execSimulation = "ok";
  } catch {
    execSimulation = "reverted-at-signature-check (expected: no owner keys available for eth_call; rely on the two-level inner-path simulations above)";
  }
  console.log(`  [simulation NOTE] Safe.execTransaction(bonus schedule) with ${threshold} dummy sigs: ${execSimulation}`);

  const bonusSafeTx = {
    to: TIMELOCK.toLowerCase(),
    value: "0",
    data: bonusScheduleData,
    operation: 0,
  };
  const feeSafeTx = {
    to: TIMELOCK.toLowerCase(),
    value: "0",
    data: feeScheduleData,
    operation: 0,
  };

  const legTemplate = (innerData: string, innerFn: string, salt: string, scheduleData: string, executeData: string) => ({
    target: POOL_CONFIGURATOR,
    function: innerFn,
    innerData,
    timelock: {
      schedule: { to: TIMELOCK, value: "0", data: scheduleData },
      execute: { to: TIMELOCK, value: "0", data: executeData },
      salt,
      predecessor: ethers.ZeroHash,
      delaySeconds: TIMELOCK_DELAY.toString(),
    },
  });

  const proposal = {
    version: "2.0",
    chainId: CHAIN_ID,
    createdAt: new Date().toISOString(),
    createdAtBlock: blockNumber,
    description:
      "FXB20551231: raise liquidation bonus 10500 -> 14000 (5% -> 40% liquidation penalty) on Fraxtal mainnet; liquidationProtocolFee discovery documented (on-chain 0, repo config says 7000)",
    safe: {
      safeAddress: GOVERNANCE_SAFE,
      threshold: threshold.toString(),
      nonce: nonce.toString(),
      nonceProof: {
        method: "storage slot 5 read at block " + blockNumber + " (Safe v1.3.0 fork without getNonce); layout cross-checked: slot3 ownerCount=" + ownerCountSlot + " == getOwners().length, slot4 threshold=" + thresholdSlot + " == getThreshold()",
        slot5Raw: await provider.getStorage(GOVERNANCE_SAFE, SAFE_NONCE_SLOT),
        revalidateBeforeSigning: "re-run this script immediately before collecting signatures; any executed Safe tx bumps the nonce (a separate dUSD proposal shares the pending queue)",
      },
      domainSeparator,
      safeTxHash: bonusSafeTxHash,
      transaction: bonusSafeTx,
    },
    signers: {
      threshold: threshold.toString(),
      owners: owners.map((o: string) => o),
      instructions: [
        `Collect ${threshold} of ${owners.length} owner EIP-712 signatures over safeTxHash ${bonusSafeTxHash} (domain separator ${domainSeparator}, Safe ${GOVERNANCE_SAFE}, chain ${CHAIN_ID}).`,
        "Signers sign the same message hash; sort signatures by owner address ascending (lowercase) when assembling execTransaction.",
        "Anyone may submit/exec the Safe tx once 3 valid signatures are assembled (execTransaction is permissionless with valid sigs).",
      ],
    },
    scheduledLeg: {
      ...legTemplate(
        bonusInnerData,
        "configureReserveAsCollateral(address,uint256,uint256,uint256)",
        BONUS_SALT,
        bonusScheduleData,
        bonusExecuteData,
      ),
      args: {
        asset: FXB20551231,
        ltv: NEW_LTV.toString(),
        liquidationThreshold: NEW_LIQUIDATION_THRESHOLD.toString(),
        liquidationBonus: NEW_LIQUIDATION_BONUS.toString(),
      },
      safeTxHash: bonusSafeTxHash,
      safeNonce: nonce.toString(),
    },
    feeLeg: scheduleFeeLeg
      ? {
          status: "SCHEDULED (on-chain fee was 7000)",
          ...legTemplate(
            feeInnerData,
            "setLiquidationProtocolFee(address,uint256)",
            FEE_SALT,
            feeScheduleData,
            feeExecuteData,
          ),
          args: { asset: FXB20551231, newFee: OPTIONAL_NEW_LIQUIDATION_PROTOCOL_FEE.toString() },
          safeTxHash: feeSafeTxHash,
          safeNonce: (nonce + 1n).toString(),
          safeTransaction: feeSafeTx,
        }
      : {
          status: "OPTIONAL - NOT SCHEDULED (on-chain fee is 0; setting 1500 would raise it and cut liquidator share from 100% to 85% of the penalty)",
          rationale:
            "Original task assumed on-chain fee 7000 (repo deploy-config default). Actual on-chain value is 0 (Pool.getConfiguration bits 152-167; corroborated by competitor liquidation tx 0x3e585404...8686b where the liquidator received the entire bonus with no treasury cut). Scheduling 1500 would work against the stated intent of increasing liquidator incentive.",
          ...legTemplate(
            feeInnerData,
            "setLiquidationProtocolFee(address,uint256)",
            FEE_SALT,
            feeScheduleData,
            feeExecuteData,
          ),
          args: { asset: FXB20551231, newFee: OPTIONAL_NEW_LIQUIDATION_PROTOCOL_FEE.toString() },
          prebuiltSafeTxHashForNonce: feeSafeTxHash,
          prebuiltSafeNonce: (nonce + 1n).toString(),
          howToActivate:
            "If governance deliberately wants a 15% protocol share of the penalty: re-run this script (fresh nonce), collect 3 sigs over the fee-leg schedule tx, execute, wait 86400s, then execute the timelock op. setLiquidationProtocolFee valid range is 0..10000 (PoolConfigurator.sol:302) and storage cap 65535 (ReserveConfiguration.sol:76).",
        },
    currentConfig: {
      ltv: currentConfig[1].toString(),
      liquidationThreshold: currentConfig[2].toString(),
      liquidationBonus: currentConfig[3].toString(),
      liquidationProtocolFeeOnChain: onChainLiqFee.toString(),
      liquidationProtocolFeeRepoConfig: "7000 (deploy-config default, never applied on-chain for this reserve)",
      reserveFactor: currentConfig[4].toString(),
      usageAsCollateralEnabled: currentConfig[5],
      isActive: currentConfig[8],
    },
    effectiveEconomics: {
      note: "With on-chain fee 0, the liquidator keeps 100% of the liquidation penalty and the protocol 0%.",
      today: { penalty: "5%", liquidatorKeeps: "5% (100% of penalty)", protocolKeeps: "0%" },
      afterScheduledLeg: { penalty: "40%", liquidatorKeeps: "40% (100% of penalty)", protocolKeeps: "0%" },
      ifOptionalFeeLegActivated: { penalty: "40%", liquidatorKeeps: "34% (85% of penalty)", protocolKeeps: "6% (15% of penalty)" },
    },
    simulations: {
      bonusScheduleFromSafe: bonusScheduleOk,
      bonusInnerFromTimelock: bonusInnerOk,
      feeScheduleFromSafe: feeScheduleOk,
      feeInnerFromTimelock: feeInnerOk,
      fullExecTransactionWithDummySigs: execSimulation,
    },
    notes: [
      "configureReserveAsCollateral (4 args) does NOT touch liquidationProtocolFee bits; the two legs are order-independent (PoolConfigurator.sol:176-178 sets only ltv/threshold/bonus).",
      "One Safe tx carries one call and no MultiSend deployment is verified on Fraxtal, so two governance changes require two sequential Safe txs (nonces N, N+1) - both timelock ops can then execute independently after their delays.",
      "The governance Safe is a GnosisSafe 1.3.0 fork without getNonce(); nonce is read from storage slot 5.",
      "safeTxHash is invalidated if any other Safe transaction executes first (nonce bump); re-run the script to regenerate.",
      "Do NOT trust deployments/fraxtal_mainnet/safe-deployment-state.json (corrupt calldata from a prior task).",
    ],
  };

  console.log("\nSafe transaction proposal:");
  console.log(JSON.stringify(proposal, null, 2));

  const outDir = path.join(__dirname, "..", "..", "..", "reports", "governance");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "fraxtal-mainnet-fxb2055-liq-bonus-40pct.json");
  fs.writeFileSync(outFile, JSON.stringify(proposal, null, 2) + "\n");
  console.log(`\nWritten: ${outFile}`);

  const criticalOk = bonusScheduleOk && bonusInnerOk && (!scheduleFeeLeg || (feeScheduleOk && feeInnerOk));
  if (!criticalOk) {
    process.exitCode = 1;
  }
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
