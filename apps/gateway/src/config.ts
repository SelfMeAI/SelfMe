import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../../..");

loadDotenv({
  path: path.join(workspaceRoot, ".env")
});

export interface GatewayConfig {
  host: string;
  port: number;
  defaultLlmProtocol: string;
  defaultLlmApiKey: string;
  defaultLlmBaseUrl?: string;
  defaultLlmModel: string;
  appVersion: string;
  localConfigPath: string;
  localSecretsPath: string;
  legacyModelConfigPath: string;
}

// 这里集中读取最终版 Gateway 配置，只保留一套 LLM_* 命名。
export function loadConfig(): GatewayConfig {
  return {
    host: process.env.GATEWAY_HOST ?? "0.0.0.0",
    port: Number(process.env.GATEWAY_PORT ?? "8000"),
    defaultLlmProtocol: process.env.LLM_PROTOCOL ?? "openai",
    defaultLlmApiKey: process.env.LLM_API_KEY ?? "",
    defaultLlmBaseUrl: process.env.LLM_BASE_URL ?? undefined,
    defaultLlmModel: process.env.LLM_MODEL ?? "gpt-4.1-mini",
    appVersion: process.env.APP_VERSION ?? "2026.4.21",
    localConfigPath: path.join(workspaceRoot, ".selfme", "config.json"),
    localSecretsPath: path.join(workspaceRoot, ".selfme", "secrets.json"),
    legacyModelConfigPath: path.join(workspaceRoot, ".selfme", "gateway.json")
  };
}
