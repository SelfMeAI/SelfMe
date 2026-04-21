import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../..");
const gatewayPort = Number(process.env.SMOKE_GATEWAY_PORT ?? "8010");
const mockPort = Number(process.env.MOCK_OPENAI_PORT ?? "9100");
const gatewayHttpUrl = `http://127.0.0.1:${gatewayPort}`;
const gatewayWsUrl = `ws://127.0.0.1:${gatewayPort}`;
const children = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: "pipe",
    ...options
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(String(chunk));
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });

  children.push(child);
  return child;
}

async function waitForHttp(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // 服务尚未启动，继续等待。
    }

    await delay(250);
  }

  throw new Error(`等待服务超时: ${url}`);
}

function cleanup() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

async function createSession(clientType) {
  const response = await fetch(`${gatewayHttpUrl}/api/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      clientType
    })
  });

  assert(response.ok, `创建会话失败: ${response.status}`);
  return response.json();
}

async function openSocket(url) {
  const socket = new WebSocket(url);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket 连接超时: ${url}`));
    }, 5000);

    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(undefined);
    }, { once: true });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket 连接失败: ${url}`));
    }, { once: true });
  });

  return socket;
}

async function waitForModernFlow(socket, sessionId, mode) {
  const events = [];
  let cancelSent = false;

  const completed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Modern ${mode} 超时`));
    }, 8000);

    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(String(event.data));
      events.push(payload);

      if (payload.type === "session.ready") {
        socket.send(JSON.stringify({
          type: "chat.send",
          sessionId,
          content: mode === "cancel" ? "cancel smoke message" : "modern smoke message"
        }));
      }

      if (mode === "cancel" && payload.type === "chat.chunk" && !cancelSent) {
        cancelSent = true;
        socket.send(JSON.stringify({
          type: "chat.cancel",
          sessionId
        }));
      }

      if (mode === "complete" && payload.type === "chat.completed") {
        clearTimeout(timeout);
        resolve(events);
      }

      if (mode === "cancel" && payload.type === "chat.cancelled") {
        clearTimeout(timeout);
        resolve(events);
      }
    });
  });

  socket.send(JSON.stringify({
    type: "session.attach",
    sessionId
  }));

  return completed;
}

function printSummary(label, events) {
  console.log(`\n[smoke] ${label}`);

  for (const event of events) {
    console.log(`[smoke]   ${event.type} ${JSON.stringify(event)}`);
  }
}

async function main() {
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  const mockServer = spawnChild(process.execPath, ["./scripts/smoke/mock-openai.mjs"], {
    env: {
      ...process.env,
      MOCK_OPENAI_PORT: String(mockPort)
    }
  });

  const gatewayServer = spawnChild(process.execPath, ["./apps/gateway/dist/index.js"], {
    env: {
      ...process.env,
      GATEWAY_HOST: "127.0.0.1",
      GATEWAY_PORT: String(gatewayPort),
      LLM_PROTOCOL: "openai",
      LLM_API_KEY: "smoke-selfme-key",
      LLM_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      LLM_MODEL: "mock-gpt-selfme"
    }
  });

  mockServer.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[smoke] mock-openai 异常退出: ${code}`);
    }
  });

  gatewayServer.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[smoke] gateway 异常退出: ${code}`);
    }
  });

  await waitForHttp(`http://127.0.0.1:${mockPort}/health`);
  await waitForHttp(`${gatewayHttpUrl}/health`);

  const health = await fetch(`${gatewayHttpUrl}/health`).then((response) => response.json());
  assert(health.status === "ok", "Gateway health 状态异常");
  assert(typeof health.activeSessions === "number", "Gateway health 缺少 activeSessions");
  assert(health.protocol === "openai", "Gateway health 缺少 protocol");

  const modernSession = await createSession("desktop");
  const modernSocket = await openSocket(`${gatewayWsUrl}/ws`);
  const modernEvents = await waitForModernFlow(modernSocket, modernSession.session.sessionId, "complete");
  modernSocket.close();

  assert(modernEvents.some((event) => event.type === "session.ready"), "Modern flow 缺少 session.ready");
  assert(modernEvents.some((event) => event.type === "chat.accepted"), "Modern flow 缺少 chat.accepted");
  assert(modernEvents.filter((event) => event.type === "chat.chunk").length >= 2, "Modern flow chunk 数量不足");
  assert(modernEvents.some((event) => event.type === "chat.completed"), "Modern flow 缺少 chat.completed");
  printSummary("modern complete", modernEvents);

  const cancelSession = await createSession("tui");
  const cancelSocket = await openSocket(`${gatewayWsUrl}/ws`);
  const cancelEvents = await waitForModernFlow(cancelSocket, cancelSession.session.sessionId, "cancel");
  cancelSocket.close();

  assert(cancelEvents.some((event) => event.type === "chat.cancelled"), "Modern cancel 缺少 chat.cancelled");
  printSummary("modern cancel", cancelEvents);

  console.log("\n[smoke] Gateway smoke passed");
}

main()
  .catch((error) => {
    console.error(`\n[smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    cleanup();
    await delay(200);
  });
