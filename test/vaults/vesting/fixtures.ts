import { parseUnits } from "ethers";
import hre, { deployments } from "hardhat";

import { ERC20VestingNFT } from "../../../typechain-types";
import { ERC20_VESTING_NFT_ID } from "../../../typescript/deploy-ids";
import { DUSD_DECIMALS } from "../../utils/decimal-utils";
import { createDStakeFixture } from "../dstake/fixtures";

export const createVestingNFTFixture = deployments.createFixture(
  async ({ deployments, getNamedAccounts }): Promise<any> => {
    // Start with the base dSTAKE fixture to get dSTAKE tokens
    const dstakeFixture = await createDStakeFixture({
      deployments,
      getNamedAccounts,
    });

    // Deploy vesting NFT
    await deployments.fixture(["dstake_nft_vesting"]); // Vesting NFT deployment tag

    const { dusdDeployer, testAccount1, testAccount2 } =
      await getNamedAccounts();

    try {
      // Get vesting NFT contract
      const vestingNFTDeployment = await deployments.get(ERC20_VESTING_NFT_ID);
      const vestingNFT = (await hre.ethers.getContractAt(
        "ERC20VestingNFT",
        vestingNFTDeployment.address,
        await hre.ethers.getSigner(dusdDeployer),
      )) as ERC20VestingNFT;

      // Setup initial environment
      await dstakeFixture.setupTestEnvironment();

      // Get some dSTAKE tokens for test accounts by depositing dUSD
      const depositAmount = parseUnits("1000", DUSD_DECIMALS); // 1000 dUSD per account

      const account1Signer = await hre.ethers.getSigner(testAccount1);
      const account2Signer = await hre.ethers.getSigner(testAccount2);

      // Deposit dUSD to get dSTAKE tokens
      await dstakeFixture.dStakeToken
        .connect(account1Signer)
        .deposit(depositAmount, testAccount1);
      await dstakeFixture.dStakeToken
        .connect(account2Signer)
        .deposit(depositAmount, testAccount2);

      // Get balances
      const dstakeBalance1 =
        await dstakeFixture.dStakeToken.balanceOf(testAccount1);
      const dstakeBalance2 =
        await dstakeFixture.dStakeToken.balanceOf(testAccount2);

      // Approve vesting NFT to spend dSTAKE tokens
      const vestingNFTAddress = await vestingNFT.getAddress();

      await dstakeFixture.dStakeToken
        .connect(account1Signer)
        .approve(vestingNFTAddress, dstakeBalance1);
      await dstakeFixture.dStakeToken
        .connect(account2Signer)
        .approve(vestingNFTAddress, dstakeBalance2);

      // Helper function to create vesting position
      const createVestingPosition = async (
        user: string,
        amount: string,
      ): Promise<{ tokenId: bigint; receipt: any }> => {
        const userSigner = await hre.ethers.getSigner(user);
        const amountWei = parseUnits(amount, DUSD_DECIMALS); // dSTAKE matches dUSD decimals (6 on Fraxtal)

        // Check if deposits are enabled
        const depositsEnabled = await vestingNFT.depositsEnabled();

        if (!depositsEnabled) {
          console.log("Deposits disabled - attempting to enable");

          // Try to enable deposits if we have admin rights
          try {
            await vestingNFT.setDepositsEnabled(true);
          } catch (error) {
            console.log("Cannot enable deposits - admin rights required");
          }
        }

        const tx = await vestingNFT.connect(userSigner).deposit(amountWei);
        const receipt = await tx.wait();

        // Extract NFT token ID from events
        const transferEvent = receipt?.logs?.find(
          (log: any) =>
            log.topics[0] ===
            hre.ethers.id("Transfer(address,address,uint256)"),
        );

        let tokenId = 0n;

        if (transferEvent && transferEvent.topics.length >= 4) {
          tokenId = BigInt(transferEvent.topics[3]);
        }

        return { tokenId, receipt };
      };

      return {
        // Include all dSTAKE fixture elements
        ...dstakeFixture,

        // Add vesting NFT specific elements
        vestingNFT,

        // Balances
        dstakeBalance1,
        dstakeBalance2,

        // Helper functions
        createVestingPosition,

        // Test amounts for vesting
        vestingAmounts: {
          small: parseUnits("10", DUSD_DECIMALS), // 10 dSTAKE
          medium: parseUnits("100", DUSD_DECIMALS), // 100 dSTAKE
          large: parseUnits("500", DUSD_DECIMALS), // 500 dSTAKE
        },
      };
    } catch (error: unknown) {
      console.log(
        "Vesting NFT deployment may not be available:",
        (error as Error).message,
      );

      // Return minimal fixture if vesting NFT not deployed
      return {
        ...dstakeFixture,
        vestingNFT: null,
        dstakeBalance1: 0n,
        dstakeBalance2: 0n,
        createVestingPosition: async () => ({ tokenId: 0n, receipt: null }),
        vestingAmounts: {
          small: parseUnits("10", DUSD_DECIMALS),
          medium: parseUnits("100", DUSD_DECIMALS),
          large: parseUnits("500", DUSD_DECIMALS),
        },
      };
    }
  },
);
