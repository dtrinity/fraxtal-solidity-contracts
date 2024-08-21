export enum eEthereumNetwork {
  kovan = "kovan",
  ropsten = "ropsten",
  main = "main",
  coverage = "coverage",
  hardhat = "hardhat",
}

export type iParamsPerNetwork<T> = iEthereumParamsPerNetwork<T>;

export interface iEthereumParamsPerNetwork<T> {
  [eEthereumNetwork.coverage]: T;
  [eEthereumNetwork.hardhat]: T;
}
