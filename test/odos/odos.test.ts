import { expect } from "chai";
import { ethers } from "ethers";

import { OdosClient } from "../../src/odos/client";
import {
  TEST_FRAXTAL_CHAIN_ID as FRAXTAL_CHAIN_ID,
  TEST_FRAXTAL_TOKENS as FRAXTAL_TOKENS,
  TEST_TOKEN_DECIMALS as TOKEN_DECIMALS,
} from "./test-constants";

describe("ODOS Client Tests", () => {
  const odosClient = new OdosClient();
  const TEST_USER_ADDRESS = "0x1234567890123456789012345678901234567890"; // Example address for testing

  describe("Quote Generation", () => {
    it("should successfully generate a quote for FRAX to frxETH swap", async () => {
      const inputAmount = "1000"; // 1000 FRAX
      const formattedAmount = OdosClient.formatTokenAmount(
        inputAmount,
        TOKEN_DECIMALS.FRAX,
      );

      const quoteRequest = {
        chainId: FRAXTAL_CHAIN_ID,
        inputTokens: [
          {
            tokenAddress: FRAXTAL_TOKENS.FRAX,
            amount: formattedAmount,
          },
        ],
        outputTokens: [
          {
            tokenAddress: FRAXTAL_TOKENS.frxETH,
            proportion: 1,
          },
        ],
        slippageLimitPercent: 1, // 1% slippage tolerance
        userAddr: TEST_USER_ADDRESS,
        referralCode: 0, // Default referral code
        disableRFQs: true, // Disable RFQ liquidity sources for reliability
        compact: true, // Enable compact calldata
      };

      const quote = await odosClient.getQuote(quoteRequest);

      expect(quote).to.not.be.null;
      expect(quote).to.have.property("pathId");
      expect(quote.outTokens).to.be.an("array");
      expect(quote.outTokens).to.have.lengthOf(1);
      expect(quote.outTokens[0].toLowerCase()).to.equal(
        FRAXTAL_TOKENS.frxETH.toLowerCase(),
      );
      expect(quote.outAmounts).to.have.lengthOf(1);
      expect(quote.outAmounts[0]).to.be.a("string");
      expect(quote).to.have.property("gasEstimate");
      expect(quote).to.have.property("blockNumber");
    });
  });

  describe("Transaction Assembly", () => {
    it("should successfully assemble a transaction from a quote", async () => {
      // First get a quote
      const inputAmount = "1000";
      const formattedAmount = OdosClient.formatTokenAmount(
        inputAmount,
        TOKEN_DECIMALS.FRAX,
      );

      const quoteRequest = {
        chainId: FRAXTAL_CHAIN_ID,
        inputTokens: [
          {
            tokenAddress: FRAXTAL_TOKENS.FRAX,
            amount: formattedAmount,
          },
        ],
        outputTokens: [
          {
            tokenAddress: FRAXTAL_TOKENS.frxETH,
            proportion: 1,
          },
        ],
        slippageLimitPercent: 1,
        userAddr: TEST_USER_ADDRESS,
        referralCode: 0, // Default referral code
        disableRFQs: true, // Disable RFQ liquidity sources for reliability
        compact: true, // Enable compact calldata
      };

      const quote = await odosClient.getQuote(quoteRequest);

      // Then assemble the transaction
      const assembleRequest = {
        userAddr: TEST_USER_ADDRESS,
        pathId: quote.pathId,
        simulate: true, // Set to true to get gas estimates
      };

      const assembled = await odosClient.assembleTransaction(assembleRequest);

      expect(assembled).to.have.property("transaction");
      expect(assembled.transaction).to.have.property("to");
      expect(assembled.transaction).to.have.property("data");
      expect(assembled.transaction).to.have.property("value");
      expect(assembled.transaction).to.have.property("gas");
    });
  });

  describe("Swap Execution (Test Only - Do Not Run)", () => {
    it("should execute a FRAX to frxETH swap", async () => {
      // NOTE: This test is a placeholder and should not be run without proper setup
      // Replace PRIVATE_KEY with your actual private key when running the test
      const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE";

      // This section is just a placeholder and won't actually run
      const provider = new ethers.JsonRpcProvider("https://rpc.frax.com");
      const wallet = new ethers.Wallet("0x" + "1".repeat(64), provider); // Dummy private key

      const inputAmount = "1000"; // 1000 FRAX
      const formattedAmount = OdosClient.formatTokenAmount(
        inputAmount,
        TOKEN_DECIMALS.FRAX,
      );

      // Get quote
      const quote = await odosClient.getQuote({
        chainId: FRAXTAL_CHAIN_ID,
        inputTokens: [
          {
            tokenAddress: FRAXTAL_TOKENS.FRAX,
            amount: formattedAmount,
          },
        ],
        outputTokens: [
          {
            tokenAddress: FRAXTAL_TOKENS.frxETH,
            proportion: 1,
          },
        ],
        slippageLimitPercent: 1,
        userAddr: wallet.address,
      });

      // Assemble transaction
      const assembled = await odosClient.assembleTransaction({
        userAddr: wallet.address,
        pathId: quote.pathId,
      });

      // NOTE: The following code would execute the swap but is commented out
      // as it requires actual funds and proper setup
      /*
      const tx = await wallet.sendTransaction({
        to: assembled.transaction.to,
        data: assembled.transaction.data,
        value: assembled.transaction.value,
        gasLimit: assembled.transaction.gasLimit
      });
      
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
      */
    });
  });
});
