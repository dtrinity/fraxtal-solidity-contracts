/**
 * Prints a log message with a timestamp and session index
 *
 * @param index - The session index (to differentiate between different runs' logs)
 * @param message - The message to print
 */
export function printLog(index: number, message: string): void {
  console.log(`${new Date().toISOString()} [${index}] ${message}`);
}
