import { spawn, type ChildProcess } from "node:child_process";
import { BrowserWindow, app, dialog } from "electron";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(currentDir, "..");
const workspaceRoot = path.resolve(desktopRoot, "../..");
const DEFAULT_GATEWAY_HOST = "0.0.0.0";
const DEFAULT_GATEWAY_PORT = 8000;

interface StoredAppConfigFile {
  gatewayHost?: string;
  gatewayPort?: number;
}

interface DesktopRuntimeConfig {
  selfmeRoot: string;
  gatewayBindHost: string;
  gatewayPort: number;
  gatewayHttpUrl: string;
  gatewayWsUrl: string;
}

interface GatewayLaunchConfig {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

interface ManagedGatewayState {
  child: ChildProcess;
  source: "desktop";
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
    if (app.isPackaged) {
      return path.join(os.homedir(), ".selfme");
    }

    return path.join(workspaceRoot, ".selfme");
  }

  return cliRoot.endsWith(".selfme") ? cliRoot : path.join(cliRoot, ".selfme");
}

function resolveDesktopIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icons/icon.png");
  }

  return path.join(desktopRoot, "public/icons/icon.png");
}

function resolveDesktopDockIconPath(): string | null {
  if (app.isPackaged) {
    return null;
  }

  return path.join(desktopRoot, "public/icons/icon.png");
}

function resolveGatewayConnectHost(bindHost?: string): string {
  const normalizedHost = bindHost?.trim() || DEFAULT_GATEWAY_HOST;

  if (normalizedHost === "0.0.0.0" || normalizedHost === "::" || normalizedHost === "[::]") {
    return "127.0.0.1";
  }

  return normalizedHost;
}

function resolveManagedGatewayBindHost(bindHost?: string): string {
  const normalizedHost = bindHost?.trim() || DEFAULT_GATEWAY_HOST;

  if (normalizedHost === "0.0.0.0" || normalizedHost === "::" || normalizedHost === "[::]") {
    return "127.0.0.1";
  }

  return normalizedHost;
}

function formatUrlHost(host: string): string {
  if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) {
    return `[${host}]`;
  }

  return host;
}

function loadRuntimeConfig(): DesktopRuntimeConfig {
  const selfmeRoot = resolveSelfMeRoot();

  if (app.isPackaged) {
    const gatewayHost = "127.0.0.1";
    const gatewayPort = DEFAULT_GATEWAY_PORT;

    return {
      selfmeRoot,
      gatewayBindHost: gatewayHost,
      gatewayPort,
      gatewayHttpUrl: `http://${gatewayHost}:${gatewayPort}`,
      gatewayWsUrl: `ws://${gatewayHost}:${gatewayPort}/ws`
    };
  }

  const appConfigPath = path.join(selfmeRoot, "app.json");
  const storedAppConfig = readJsonFile<StoredAppConfigFile>(appConfigPath);
  const gatewayPort = typeof storedAppConfig?.gatewayPort === "number" && Number.isFinite(storedAppConfig.gatewayPort)
    ? storedAppConfig.gatewayPort
    : DEFAULT_GATEWAY_PORT;
  const gatewayBindHost = resolveManagedGatewayBindHost(storedAppConfig?.gatewayHost);
  const gatewayHost = formatUrlHost(resolveGatewayConnectHost(storedAppConfig?.gatewayHost));

  return {
    selfmeRoot,
    gatewayBindHost,
    gatewayPort,
    gatewayHttpUrl: `http://${gatewayHost}:${gatewayPort}`,
    gatewayWsUrl: `ws://${gatewayHost}:${gatewayPort}/ws`
  };
}

function isDesktopDevMode(): boolean {
  return Boolean(readCliOption("--renderer-url"));
}

function resolveGatewayLaunchConfig(runtimeConfig: DesktopRuntimeConfig): GatewayLaunchConfig {
  const gatewayArgs = [
    `--selfme-root=${runtimeConfig.selfmeRoot}`,
    `--gateway-host=${runtimeConfig.gatewayBindHost}`,
    `--gateway-port=${runtimeConfig.gatewayPort}`
  ];

  if (app.isPackaged) {
    gatewayArgs.push("--managed-client=desktop");
  }

  if (isDesktopDevMode()) {
    return {
      command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      args: ["--filter", "@selfme/gateway", "dev", "--", ...gatewayArgs],
      cwd: workspaceRoot
    };
  }

  const gatewayEntryPath = app.isPackaged
    ? path.join(process.resourcesPath, "runtime/gateway.cjs")
    : path.join(desktopRoot, "dist-runtime/gateway.cjs");

  if (!existsSync(gatewayEntryPath)) {
    throw new Error(`Gateway build not found: ${gatewayEntryPath}`);
  }

  return {
    command: process.execPath,
    args: [gatewayEntryPath, ...gatewayArgs],
    cwd: app.isPackaged ? process.resourcesPath : workspaceRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      SELFME_APP_VERSION: app.getVersion()
    }
  };
}

async function isGatewayReachable(gatewayHttpUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${gatewayHttpUrl}/health`, {
      signal: AbortSignal.timeout(1000)
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function waitForGateway(gatewayHttpUrl: string, attempts = 60): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (await isGatewayReachable(gatewayHttpUrl)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Gateway did not become ready in time: ${gatewayHttpUrl}`);
}

async function ensureGatewayReady(runtimeConfig: DesktopRuntimeConfig): Promise<ManagedGatewayState | null> {
  if (await isGatewayReachable(runtimeConfig.gatewayHttpUrl)) {
    return null;
  }

  const launchConfig = resolveGatewayLaunchConfig(runtimeConfig);
  const child = spawn(launchConfig.command, launchConfig.args, {
    cwd: launchConfig.cwd,
    stdio: "inherit",
    env: launchConfig.env
  });

  const exitPromise = new Promise<never>((_, reject) => {
    child.once("exit", (code, signal) => {
      reject(new Error(`Gateway exited before becoming ready (code=${code ?? "null"} signal=${signal ?? "null"})`));
    });
  });

  try {
    await Promise.race([waitForGateway(runtimeConfig.gatewayHttpUrl), exitPromise]);
  } catch (error) {
    if (!child.killed && child.exitCode === null) {
      child.kill("SIGTERM");
    }

    throw error;
  }

  return {
    child,
    source: "desktop"
  };
}

function stopManagedGateway(managedGateway: ManagedGatewayState | null): void {
  if (!managedGateway) {
    return;
  }

  if (!managedGateway.child.killed && managedGateway.child.exitCode === null) {
    managedGateway.child.kill("SIGTERM");
  }
}

function createWindow(runtimeConfig: DesktopRuntimeConfig): void {
  const desktopIconPath = resolveDesktopIconPath();
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    icon: desktopIconPath,
    webPreferences: {
      preload: path.join(currentDir, "preload.js"),
      contextIsolation: true,
      additionalArguments: [
        `--gateway-http-url=${runtimeConfig.gatewayHttpUrl}`,
        `--gateway-ws-url=${runtimeConfig.gatewayWsUrl}`
      ]
    }
  });

  // 开发期优先连接 Vite，本地构建时回退到静态文件。
  const rendererUrl = readCliOption("--renderer-url");

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
    window.webContents.openDevTools();
    return;
  }

  void window.loadFile(path.join(currentDir, "../dist-renderer/index.html"));
}

let managedGateway: ManagedGatewayState | null = null;

app.whenReady().then(async () => {
  const runtimeConfig = loadRuntimeConfig();
  const desktopDockIconPath = resolveDesktopDockIconPath();

  if (process.platform === "darwin" && app.dock && desktopDockIconPath) {
    try {
      app.dock.setIcon(desktopDockIconPath);
    } catch {
      // 开发态 Dock 图标加载失败时不阻塞启动，打包态会由 app bundle 自己提供图标。
    }
  }

  try {
    managedGateway = await ensureGatewayReady(runtimeConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start gateway";
    dialog.showErrorBox("SelfMe Gateway Error", message);
    app.quit();
    return;
  }

  createWindow(runtimeConfig);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(runtimeConfig);
    }
  });
});

app.on("before-quit", () => {
  stopManagedGateway(managedGateway);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
