import { spawn } from "node:child_process";
import process from "node:process";

const rendererUrl = "http://127.0.0.1:5173";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];

function spawnCommand(args, options = {}) {
  const child = spawn(pnpmCommand, args, {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit",
    ...options
  });

  children.push(child);
  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function waitForRenderer(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // 开发服务器尚未就绪，继续轮询。
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Renderer 未能在预期时间内启动: ${url}`);
}

async function main() {
  process.on("SIGINT", () => {
    stopChildren();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    stopChildren();
    process.exit(0);
  });

  const buildMain = spawnCommand(["exec", "tsc", "-p", "tsconfig.node.json"]);

  await new Promise((resolve, reject) => {
    buildMain.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Electron 主进程构建失败，退出码 ${code ?? "unknown"}`));
    });
  });

  const renderer = spawnCommand(["exec", "vite", "--host", "127.0.0.1", "--port", "5173"]);

  renderer.on("exit", (code) => {
    if (code && code !== 0) {
      stopChildren();
      process.exit(code);
    }
  });

  await waitForRenderer(rendererUrl);

  const electron = spawnCommand(["exec", "electron", "dist-electron/main.js", `--renderer-url=${rendererUrl}`]);

  electron.on("exit", (code) => {
    stopChildren();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  stopChildren();
  process.exit(1);
});
