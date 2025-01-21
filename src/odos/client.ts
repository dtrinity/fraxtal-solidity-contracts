import axios from "axios";
import { ethers } from "ethers";

import {
  AssembleRequest,
  AssembleResponse,
  QuoteRequest,
  QuoteResponse,
} from "./types";

export class OdosClient {
  /**
   * Create a new ODOS client instance
   *
   * @param baseUrl - Base URL for ODOS API
   * @param chainId - Optional chain ID to validate requests
   * @param tokenAddresses - Optional map of token symbols to addresses
   */
  constructor(
    private readonly baseUrl: string = "https://api.odos.xyz",
    private readonly chainId?: number,
    private readonly tokenAddresses?: Record<string, string>,
  ) {}

  /**
   * Generate a quote for a swap through ODOS
   *
   * @param request Quote request parameters
   * @returns Quote response with pathId and output amounts
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    // Validate chainId if provided
    if (this.chainId && request.chainId !== this.chainId) {
      throw new Error(
        `Chain ID mismatch. Expected ${this.chainId}, got ${request.chainId}`,
      );
    }

    try {
      console.log("Sending quote request:", JSON.stringify(request, null, 2));
      const response = await axios.post<QuoteResponse>(
        `${this.baseUrl}/sor/quote/v2`,
        request,
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      console.log("Quote response:", JSON.stringify(response.data, null, 2));

      if (
        !response.data ||
        !response.data.pathId ||
        !response.data.outTokens ||
        !response.data.outAmounts
      ) {
        throw new Error(
          "Invalid response from ODOS API: Missing required fields",
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error("ODOS API Error:", error.response.data);
        throw new Error(
          `Quote failed: ${error.response.data.message || error.message}`,
        );
      }
      console.error("Unexpected error:", error);
      throw error;
    }
  }

  /**
   * Assemble a transaction for executing a swap
   *
   * @param request Assembly request parameters including pathId from quote
   * @returns Assembled transaction data ready for execution
   */
  async assembleTransaction(
    request: AssembleRequest,
  ): Promise<AssembleResponse> {
    try {
      const response = await axios.post<AssembleResponse>(
        `${this.baseUrl}/sor/assemble`,
        request,
        {
          headers: { "Content-Type": "application/json" },
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(
          `Assembly failed: ${error.response.data.message || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Helper method to format token amounts according to decimals
   *
   * @param amount Amount in human readable format
   * @param decimals Token decimals
   * @returns Amount formatted as string in token base units
   */
  static formatTokenAmount(amount: string | number, decimals: number): string {
    return ethers.parseUnits(amount.toString(), decimals).toString();
  }

  /**
   * Helper method to parse token amounts from base units
   *
   * @param amount Amount in base units
   * @param decimals Token decimals
   * @returns Amount in human readable format
   */
  static parseTokenAmount(amount: string, decimals: number): string {
    return ethers.formatUnits(amount, decimals);
  }
}
