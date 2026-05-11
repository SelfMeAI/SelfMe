import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT
} from "@selfme/protocol";

const currentDir = typeof __dirname === "string"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../../..");

interface StoredAppConfigFile {
  gatewayHost?: string;
  gatewayPort?: number;
}

interface RootPackageJson {
  version?: string;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readCliOption(name: string): string | undefined {
  const exactIndex = process.argv.findIndex((argument) => argument === name);

  if (exactIndex >= 0) {
    return process.argv[exactIndex + 1];
  }

  const prefix = `${name}=`;
  const prefixedArgument = process.argv.find((argument) => argument.startsWith(prefix));

  return prefixedArgument ? prefixedArgument.slice(prefix.length) : undefined;
}

function resolveSelfMeRoot(): string {
  const cliRoot = readCliOption("--selfme-root");

  if (!cliRoot) {
    return path.join(workspaceRoot, ".selfme");
  }

  return cliRoot.endsWith(".selfme") ? cliRoot : path.join(cliRoot, ".selfme");
}

function isDesktopManagedRuntime(): boolean {
  return readCliOption("--managed-client") === "desktop";
}

function normalizeAppConfig(input: StoredAppConfigFile | null): { gatewayHost: string; gatewayPort: number } {
  const gatewayHost = input?.gatewayHost?.trim() || DEFAULT_GATEWAY_HOST;
  const gatewayPort = typeof input?.gatewayPort === "number" && Number.isFinite(input.gatewayPort)
    ? input.gatewayPort
    : DEFAULT_GATEWAY_PORT;

  return {
    gatewayHost,
    gatewayPort
  };
}

function resolveGatewayHost(input: string): string {
  const cliHost = readCliOption("--gateway-host")?.trim();

  if (cliHost) {
    return cliHost;
  }

  return input;
}

function resolveGatewayPort(input: number): number {
  const cliPort = readCliOption("--gateway-port");

  if (!cliPort) {
    return input;
  }

  const parsedPort = Number(cliPort);
  return Number.isFinite(parsedPort) ? parsedPort : input;
}

function materializeAppConfig(appConfigPath: string): { gatewayHost: string; gatewayPort: number } {
  const stored = readJsonFile<StoredAppConfigFile>(appConfigPath);
  const normalized = normalizeAppConfig(stored);

  if (!existsSync(appConfigPath)) {
    mkdirSync(path.dirname(appConfigPath), {
      recursive: true
    });

    writeFileSync(appConfigPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  }

  return normalized;
}

function readAppVersion(): string {
  const injectedVersion = process.env.SELFME_APP_VERSION?.trim();

  if (injectedVersion) {
    return injectedVersion;
  }

  const rootPackage = readJsonFile<RootPackageJson>(path.join(workspaceRoot, "package.json"));
  return rootPackage?.version?.trim() || "0.0.0";
}

export interface GatewayConfig {
  host: string;
  port: number;
  appVersion: string;
  appConfigPath: string;
  localSettingsPath: string;
}

export function loadConfig(): GatewayConfig {
  const selfmeConfigRoot = resolveSelfMeRoot();
  const appConfigPath = path.join(selfmeConfigRoot, "app.json");
  const appConfig = isDesktopManagedRuntime()
    ? normalizeAppConfig(null)
    : materializeAppConfig(appConfigPath);

  return {
    host: resolveGatewayHost(appConfig.gatewayHost),
    port: resolveGatewayPort(appConfig.gatewayPort),
    appVersion: readAppVersion(),
    appConfigPath,
    localSettingsPath: path.join(selfmeConfigRoot, "settings.json")
  };
}
