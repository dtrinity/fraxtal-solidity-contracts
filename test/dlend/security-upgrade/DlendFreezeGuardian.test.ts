import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import hre from "hardhat";

import type { DlendFreezeGuardian } from "../../../typechain-types/contracts/lending/periphery/misc/DlendFreezeGuardian";
import type { MockACLManager } from "../../../typechain-types/contracts/test/dlend/MockDlendFreezeGuardianDependencies.sol/MockACLManager";
import type { MockPoolConfigurator } from "../../../typechain-types/contracts/test/dlend/MockDlendFreezeGuardianDependencies.sol/MockPoolConfigurator";

interface DlendFreezeGuardianFixture {
  governanceSafe: HardhatEthersSigner;
  nonOwner: HardhatEthersSigner;
  configurator: MockPoolConfigurator;
  aclManager: MockACLManager;
  guardian: DlendFreezeGuardian;
}

describe("DlendFreezeGuardian", () => {
  /**
   * Deploys mock DLend dependencies and a risk-admin freeze guardian.
   *
   * @returns The deployed guardian fixture.
   */
  async function deployFixture(): Promise<DlendFreezeGuardianFixture> {
    const [, governanceSafe, nonOwner] = await hre.ethers.getSigners();

    const configuratorFactory = await hre.ethers.getContractFactory("MockPoolConfigurator");
    const configurator = await configuratorFactory.deploy();

    const aclFactory = await hre.ethers.getContractFactory("MockACLManager");
    const aclManager = await aclFactory.deploy();

    const providerFactory = await hre.ethers.getContractFactory("MockPoolAddressesProvider");
    const provider = await providerFactory.deploy(await configurator.getAddress(), await aclManager.getAddress());

    const guardianFactory = await hre.ethers.getContractFactory("DlendFreezeGuardian");
    const guardian = await guardianFactory.deploy(await provider.getAddress(), governanceSafe.address);

    await aclManager.setRiskAdmin(await guardian.getAddress(), true);

    return {
      governanceSafe,
      nonOwner,
      configurator,
      aclManager,
      guardian,
    };
  }

  it("sets governance safe as owner", async () => {
    const { guardian, governanceSafe } = await deployFixture();

    expect(await guardian.owner()).to.equal(governanceSafe.address);
  });

  it("lets the owner freeze a single reserve", async () => {
    const { configurator, governanceSafe, guardian } = await deployFixture();
    const asset = "0x0000000000000000000000000000000000001001";

    await expect(guardian.connect(governanceSafe).freezeReserve(asset))
      .to.emit(configurator, "ReserveFreezeSet")
      .withArgs(await guardian.getAddress(), asset, true);

    expect(await configurator.frozen(asset)).to.equal(true);
  });

  it("lets the owner freeze a batch of reserves", async () => {
    const { configurator, governanceSafe, guardian } = await deployFixture();
    const assets = [
      "0x0000000000000000000000000000000000001001",
      "0x0000000000000000000000000000000000001002",
      "0x0000000000000000000000000000000000001003",
    ];

    await guardian.connect(governanceSafe).freezeReserves(assets);

    for (const asset of assets) {
      expect(await configurator.frozen(asset)).to.equal(true);
    }
    expect(await configurator.frozenAssetsLength()).to.equal(assets.length);
  });

  it("rejects non-owner freezes", async () => {
    const { guardian, nonOwner } = await deployFixture();
    const asset = "0x0000000000000000000000000000000000001001";

    await expect(guardian.connect(nonOwner).freezeReserve(asset)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(guardian.connect(nonOwner).freezeReserves([asset])).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("does not expose pause or generic forwarding functions", async () => {
    const { governanceSafe, guardian } = await deployFixture();
    const functionNames = guardian.interface.fragments.filter((fragment) => fragment.type === "function").map((fragment) => fragment.name);

    expect(functionNames).to.not.include("pause");
    expect(functionNames).to.not.include("setReservePause");
    expect(functionNames).to.not.include("execute");
    expect(functionNames).to.not.include("multicall");

    const pauseSelector = hre.ethers.id("setReservePause(address,bool)").slice(0, 10);
    const pauseArguments = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "bool"],
      ["0x0000000000000000000000000000000000001001", true],
    );
    const pauseCalldata = pauseSelector + pauseArguments.slice(2);

    await expect(governanceSafe.sendTransaction({ to: await guardian.getAddress(), data: pauseCalldata })).to.be.reverted;
  });

  it("keeps the guardian in the risk-admin role only", async () => {
    const { aclManager, guardian } = await deployFixture();
    const guardianAddress = await guardian.getAddress();

    expect(await aclManager.isRiskAdmin(guardianAddress)).to.equal(true);
    expect(await aclManager.isEmergencyAdmin(guardianAddress)).to.equal(false);
    expect(await aclManager.isPoolAdmin(guardianAddress)).to.equal(false);
  });
});
