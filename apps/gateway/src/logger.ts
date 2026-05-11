const colors = {
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m"
};

type LogContext = Record<string, string | number | boolean | undefined | null>;

function timestamp(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour12: false
  });
}

function formatContext(input?: LogContext): string {
  if (!input) {
    return "";
  }

  const parts = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${typeof value === "string" && value.includes(" ") ? JSON.stringify(value) : String(value)}`);

  return parts.length > 0 ? parts.join(" ") : "";
}

function print(color: string, prefix: string, message: string, context?: LogContext): void {
  const formattedContext = formatContext(context);
  const contextSuffix = formattedContext ? ` ${colors.dim}${formattedContext}${colors.reset}` : "";
  console.log(`${colors.dim}${timestamp()}${colors.reset} ${color}${prefix}${colors.reset} ${message}${contextSuffix}`);
}

export function logInfo(message: string, context?: LogContext): void {
  print(colors.blue, "INFO", message, context);
}

export function logSuccess(message: string, context?: LogContext): void {
  print(colors.green, "OK", message, context);
}

export function logWarning(message: string, context?: LogContext): void {
  print(colors.yellow, "WARN", message, context);
}

export function logError(message: string, context?: LogContext): void {
  print(colors.red, "ERROR", message, context);
}

export function logBanner(input: {
  host: string;
  port: number;
  protocol: string;
  model: string;
  version: string;
  apiKeyConfigured: boolean;
  baseUrl?: string;
}): void {
  console.log("");
  console.log(`${colors.cyan}  ███████╗███████╗██╗     ███████╗███╗   ███╗███████╗${colors.reset}`);
  console.log(`${colors.cyan}  ██╔════╝██╔════╝██║     ██╔════╝████╗ ████║██╔════╝${colors.reset}`);
  console.log(`${colors.cyan}  ███████╗█████╗  ██║     █████╗  ██╔████╔██║█████╗${colors.reset}`);
  console.log(`${colors.cyan}  ╚════██║██╔══╝  ██║     ██╔══╝  ██║╚██╔╝██║██╔══╝${colors.reset}`);
  console.log(`${colors.cyan}  ███████║███████╗███████╗██║     ██║ ╚═╝ ██║███████╗${colors.reset}`);
  console.log(`${colors.cyan}  ╚══════╝╚══════╝╚══════╝╚═╝     ╚═╝     ╚═╝╚══════╝${colors.reset}`);
  console.log("");
  console.log(`  Gateway  http://${input.host}:${input.port}`);
  console.log(`  Version  ${input.version}`);
  console.log(`  Protocol ${input.protocol}`);
  console.log(`  Model    ${input.model}`);
  if (input.baseUrl) {
    console.log(`  Base URL ${input.baseUrl}`);
  }
  console.log(`  API Key  ${input.apiKeyConfigured ? "Configured" : "Missing"}`);
  console.log("  Press Ctrl+C to stop");
  console.log("");
}
