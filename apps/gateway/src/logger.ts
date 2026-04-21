const colors = {
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m"
};

function timestamp(): string {
  return new Date().toLocaleTimeString("zh-CN", {
    hour12: false
  });
}

function print(color: string, prefix: string, message: string): void {
  console.log(`${colors.dim}${timestamp()}${colors.reset} ${color}${prefix} ${message}${colors.reset}`);
}

export function logInfo(message: string): void {
  print(colors.blue, "ℹ", message);
}

export function logSuccess(message: string): void {
  print(colors.green, "✓", message);
}

export function logWarning(message: string): void {
  print(colors.yellow, "!", message);
}

export function logError(message: string): void {
  print(colors.red, "✗", message);
}

export function logBanner(input: {
  host: string;
  port: number;
  protocol: string;
  model: string;
  version: string;
  apiKeyConfigured: boolean;
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
  console.log(`  Protocol ${input.protocol}`);
  console.log(`  Model    ${input.model}`);
  console.log(`  Version  ${input.version}`);
  console.log(`  API Key  ${input.apiKeyConfigured ? "Configured" : "Missing"}`);
  console.log("  Press Ctrl+C to stop");
  console.log("");
}
