import fs from "fs";
import path from "path";

/**
 * Walk up the directory tree until a package.json is found.
 * Used by scripts that need a stable project root.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let current = startDir;
  // Limit traversal to avoid infinite loops
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}
