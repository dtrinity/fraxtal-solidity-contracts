import { BigNumberish, ContractTransactionResponse, ethers } from "ethers";
import hre from "hardhat";

import { tEthereumAddress, tStringTokenSmallUnits } from "./types";

export const buildDSwapLiquiditySwapParams = (
  assetToSwapTo: tEthereumAddress,
  minAmountToReceive: BigNumberish,
  swapAllBalanceOffset: BigNumberish,
  swapPoolFee: Number,
  permitAmount: BigNumberish,
  deadline: BigNumberish,
  v: BigNumberish,
  r: string | Buffer,
  s: string | Buffer,
): string => {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "address",
      "uint256",
      "uint256",
      "uint24",
      "tuple(uint256,uint256,uint8,bytes32,bytes32)",
    ],
    [
      assetToSwapTo,
      minAmountToReceive,
      swapAllBalanceOffset,
      swapPoolFee,
      [permitAmount, deadline, v, r, s],
    ],
  );
};

interface TypedDataParams {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: tEthereumAddress;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  value: Record<string, any>;
}

export const buildPermitParams = (
  chainId: number,
  token: tEthereumAddress,
  revision: string,
  tokenName: string,
  owner: tEthereumAddress,
  spender: tEthereumAddress,
  nonce: number,
  deadline: string,
  value: tStringTokenSmallUnits,
): TypedDataParams => ({
  domain: {
    name: tokenName,
    version: revision,
    chainId: chainId,
    verifyingContract: token,
  },
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  value: {
    owner,
    spender,
    value,
    nonce,
    deadline,
  },
});

export const buildLiquiditySwapParams = (
  assetToSwapToList: tEthereumAddress[],
  minAmountsToReceive: BigNumberish[],
  swapAllBalances: BigNumberish[],
  permitAmounts: BigNumberish[],
  deadlines: BigNumberish[],
  v: BigNumberish[],
  r: (string | Buffer)[],
  s: (string | Buffer)[],
  useEthPath: boolean[],
): string => {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "address[]",
      "uint256[]",
      "bool[]",
      "uint256[]",
      "uint256[]",
      "uint8[]",
      "bytes32[]",
      "bytes32[]",
      "bool[]",
    ],
    [
      assetToSwapToList,
      minAmountsToReceive,
      swapAllBalances,
      permitAmounts,
      deadlines,
      v,
      r,
      s,
      useEthPath,
    ],
  );
};

export const buildDSwapRepayParams = (
  collateralAsset: tEthereumAddress,
  collateralAmount: BigNumberish,
  buyAllBalanceOffset: BigNumberish,
  debtRateMode: BigNumberish,
  swapPoolFee: Number,
  permitAmount: BigNumberish,
  deadline: BigNumberish,
  v: BigNumberish,
  r: string | Buffer,
  s: string | Buffer,
): string => {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "address",
      "uint256",
      "uint256",
      "uint256",
      "bytes",
      "tuple(uint256,uint256,uint8,bytes32,bytes32)",
    ],
    [
      collateralAsset,
      collateralAmount,
      buyAllBalanceOffset,
      debtRateMode,
      swapPoolFee,
      [permitAmount, deadline, v, r, s],
    ],
  );
};

export const parseUnitsFromToken = async (
  tokenAddress: tEthereumAddress,
  amount: string,
): Promise<bigint> => {
  const artifact = await hre.deployments.getArtifact(
    "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20Detailed.sol:IERC20Detailed",
  );
  const token = await hre.ethers.getContractAt(artifact.abi, tokenAddress);

  const decimals = await token.decimals();

  return hre.ethers.parseUnits(amount, decimals);
};

export const waitForTx = async (
  tx: ContractTransactionResponse,
): Promise<ethers.ContractTransactionReceipt | null> => await tx.wait(1);
