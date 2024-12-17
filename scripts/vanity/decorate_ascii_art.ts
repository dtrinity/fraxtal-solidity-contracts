import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ASCII_ART = `/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\\  __-.  /\\__  _\\ /\\  == \\   /\\ \\   /\\ \"-.\\ \\   /\\ \\   /\\__  _\\ /\\ \\_\\ \\      *
 *   \\ \\ \\/\\ \\ \\/_/\\ \\/ \\ \\  __<   \\ \\ \\  \\ \\ \\-.  \\  \\ \\ \\  \\/_/\\ \\/ \\ \\____ \\     *
 *    \\ \\____-    \\ \\_\\  \\ \\_\\ \\_\\  \\ \\_\\  \\ \\_\\\\\"\\_\\  \\ \\_\\    \\ \\_\\  \\/\\_____\\    *
 *     \\/____/     \\/_/   \\/_/ /_/   \\/_/   \\/_/ \\/_/   \\/_/     \\/_/   \\/_____/    *
 *                                                                                  *
 * ————————————————————————————————— dtrinity.org ————————————————————————————————— *
 *                                                                                  *
 *                                         ▲                                        *
 *                                        ▲ ▲                                       *
 *                                                                                  *
 * ———————————————————————————————————————————————————————————————————————————————— *
 * dTRINITY Protocol: https://github.com/dtrinity                                   *
 * ———————————————————————————————————————————————————————————————————————————————— */`;

/**
 * Decorates a Solidity file by adding ASCII art after the license identifier
 *
 * @param filePath - Path to the Solidity file to be decorated
 */
function decorateFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf8");

    // Check if file is already decorated
    if (content.includes(ASCII_ART)) {
      console.log(`File ${filePath} is already decorated, skipping...`);
      return;
    }

    // Split content into lines
    const lines = content.split("\n");

    // Find the position to insert the ASCII art
    let insertPosition = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("SPDX-License-Identifier")) {
        insertPosition = i + 1;
        break;
      }
    }

    if (insertPosition === -1) {
      console.warn(`No license identifier found in ${filePath}, skipping...`);
      return;
    }

    // Insert the ASCII art
    lines.splice(insertPosition, 0, ASCII_ART);

    // Write the modified content back to file
    writeFileSync(filePath, lines.join("\n"));
    console.log(`Successfully decorated ${filePath}`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

/**
 * Recursively processes a directory to decorate all Solidity files
 *
 * @param dirPath - Path to the directory to process
 */
function processDirectory(dirPath: string): void {
  try {
    const files = readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = join(dirPath, file.name);

      if (file.isDirectory()) {
        processDirectory(fullPath);
      } else if (file.name.endsWith(".sol")) {
        decorateFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

/**
 * Processes a given path, which can be either a file or directory
 *
 * @param path - Path to process (file or directory)
 */
function processPath(path: string): void {
  try {
    const _stats = readdirSync(path, { withFileTypes: true });
    // If we get here, it's a directory
    processDirectory(path);
  } catch (error) {
    // If path is a file (or contains wildcards), try to process it directly
    if (path.endsWith(".sol")) {
      decorateFile(path);
    } else {
      console.error(`Error processing path ${path}:`, error);
    }
  }
}

// Update the usage section
const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.log("Processing default directory: ./contracts");
  processDirectory("./contracts");
} else {
  paths.forEach((path) => {
    console.log(`Processing path: ${path}`);
    processPath(path);
  });
}
