export interface UserStateLog {
  healthFactor: string;
  toLiquidateAmount: string;
  collateralToken:
    | {
        address: string;
        symbol: string;
      }
    | undefined;
  debtToken:
    | {
        address: string;
        symbol: string;
      }
    | undefined;
  lastTrial: number;
  profitInUSD: string;
  profitable: boolean;
  success: boolean;
  error: Error | string;
  errorMessage: string;
}
