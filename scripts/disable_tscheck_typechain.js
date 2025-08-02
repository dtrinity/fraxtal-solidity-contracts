import { promises as fs } from "fs";
import path from "path";

/**
 * Recursively adds @ts-nocheck to all TypeScript files in a directory
 *
 * @param dir - The directory path to process
 * @returns {Promise<void>} Promise that resolves when all files have been processed
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- TS lint getting applied to JS
async function addNoCheck(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await addNoCheck(full);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        let content = await fs.readFile(full, "utf8");

        if (!content.startsWith("// @ts-nocheck")) {
          await fs.writeFile(full, `// @ts-nocheck\n${content}`);
        }
      }
    }),
  );
}

await addNoCheck(path.resolve("typechain-types"));
