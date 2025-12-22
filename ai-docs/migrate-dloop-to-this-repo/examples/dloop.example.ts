import { DLoopConfig } from "../../../config/types";

// Example dLOOP config fragment; merge into a full Config object.
export const dLoopExample: DLoopConfig = {
  dUSDAddress: "0x0000000000000000000000000000000000000000",
  flashLenderAddress: "0x0000000000000000000000000000000000000000",
  coreVaults: {
    example: {
      venue: "dlend",
      name: "Leveraged Example Vault",
      symbol: "EXAMPLE-3x",
      underlyingAsset: "0x0000000000000000000000000000000000000000",
      dStable: "0x0000000000000000000000000000000000000000",
      targetLeverageBps: 300 * 100 * 100, // 300% leverage
      lowerBoundTargetLeverageBps: 200 * 100 * 100, // 200% leverage
      upperBoundTargetLeverageBps: 400 * 100 * 100, // 400% leverage
      maxSubsidyBps: 2 * 100 * 100, // 2% subsidy
      minDeviationBps: 2 * 100 * 100, // 2% deviation
      withdrawalFeeBps: 0.4 * 100 * 100, // 0.4% withdrawal fee
      extraParams: {
        targetStaticATokenWrapper: "0x0000000000000000000000000000000000000000",
        treasury: "0x0000000000000000000000000000000000000000",
        maxTreasuryFeeBps: 5 * 100 * 100, // 5%
        initialTreasuryFeeBps: 1 * 100 * 100, // 1%
        initialExchangeThreshold: 0n,
        lendingPoolAddressesProvider: "0x0000000000000000000000000000000000000000",
        poolDataProvider: "0x0000000000000000000000000000000000000000",
        rewardsController: "0x0000000000000000000000000000000000000000",
        dLendAssetToClaimFor: "0x0000000000000000000000000000000000000000",
      },
    },
  },
  depositors: {
    odos: {
      router: "0x0000000000000000000000000000000000000000",
    },
  },
};
