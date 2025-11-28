type LogLevel = "info" | "warn" | "error" | "success";

function log(level: LogLevel, message: string): void {
  const prefix = {
    info: "[INFO]",
    warn: "[WARN]",
    error: "[ERROR]",
    success: "[SUCCESS]",
  }[level];
  // Keep logging simple and dependency free for scripts
  // eslint-disable-next-line no-console
  console.log(`${prefix} ${message}`);
}

export const logger = {
  info: (message: string): void => log("info", message),
  warn: (message: string): void => log("warn", message),
  error: (message: string): void => log("error", message),
  success: (message: string): void => log("success", message),
};
