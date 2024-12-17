import { ContractTransactionReceipt, LogDescription } from "ethers";
import { ethers } from "hardhat";

export interface IContractParsedLog {
  interface: {
    parseLog: (log: any) => LogDescription | null;
  };
}

/**
 * Get the event logs from the transaction receipt
 *
 * @param contract - The target contract to parse the event logs (just a ethers.Contract instance)
 * @param receipt - The transaction receipt
 * @param eventNames - The event names to be picked
 * @returns - The parsed logs
 */
export async function getEventFromTransaction(
  contract: IContractParsedLog,
  receipt: ContractTransactionReceipt,
  eventNames: string[],
): Promise<LogDescription[]> {
  // Get the logs from the receipt
  const logs = await ethers.provider.getLogs({
    fromBlock: receipt?.blockNumber,
    toBlock: receipt?.blockNumber,
  });

  // Parse the logs with the contract
  const parsedLogs = logs.map((log) => contract.interface.parseLog(log));
  const notNullParsedLogs: LogDescription[] = [];

  for (const parsedLog of parsedLogs) {
    if (parsedLog !== null && eventNames.includes(parsedLog.name)) {
      notNullParsedLogs.push(parsedLog);
    }
  }
  return notNullParsedLogs;
}
