// Define an error
export class NotProfitableLiquidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiquidationError";
  }
}
