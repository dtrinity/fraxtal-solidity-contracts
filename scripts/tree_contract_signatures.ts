import fs from "fs";
import path from "path";

interface AbiItem {
  type: string;
  name?: string;
  inputs?: { name: string; type: string }[];
  outputs?: { type: string }[];
  stateMutability?: string;
}

interface ContractAbi {
  contractName: string;
  abi: AbiItem[];
}

const ignoredDirectories = ["dependencies", "dex", "lending", "test", "token"];

/**
 * Helper to summarize function
 *
 * @param item - The AbiItem to summarize
 * @returns A string representation of the function signature
 */
function summarizeFunction(item: AbiItem): string {
  const inputs =
    item.inputs?.map((input) => `${input.name}: ${input.type}`).join(", ") ||
    "";
  const outputs =
    item.outputs?.map((output) => output.type).join(", ") || "void";
  return `${item.name}(${inputs}) => ${outputs} [${item.stateMutability}]`;
}

/**
 * Helper to process a file
 *
 * @param filePath - The path of the file to process
 */
function processFile(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const contractAbi: ContractAbi = JSON.parse(content);

  console.log(`\n${contractAbi.contractName}`);
  console.log("└─ Functions:");

  contractAbi.abi
    .filter((item) => item.type === "function")
    .forEach((item, index, array) => {
      const prefix = index === array.length - 1 ? "   └─ " : "   ├─ ";
      console.log(`${prefix}${summarizeFunction(item)}`);
    });
}

/**
 * Helper to traverse a directory
 *
 * @param dir - The directory to traverse
 */
function traverseDirectory(dir: string): void {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!ignoredDirectories.includes(file)) {
        traverseDirectory(filePath);
      }
    } else if (file.endsWith(".json") && !file.endsWith(".dbg.json")) {
      processFile(filePath);
    }
  }
}

// Start traversing from the artifacts/contracts directory
traverseDirectory(path.join(__dirname, "..", "artifacts", "contracts"));
