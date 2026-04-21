import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import { registerHealthRoutes } from "./routes/health.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerWsRoutes } from "./routes/ws.js";
import { loadConfig } from "./config.js";
import { LLMService } from "./services/llm-service.js";
import { LLMSettingsStore } from "./services/llm-settings-store.js";
import { SessionStore } from "./services/session-store.js";
import { ToolRegistry } from "./services/tool-registry.js";

export function createApp() {
  const config = loadConfig();
  const app = Fastify({
    logger: false
  });

  const sessions = new SessionStore();
  const tools = new ToolRegistry();
  const settings = new LLMSettingsStore({
    configPath: config.localConfigPath,
    secretsPath: config.localSecretsPath,
    legacyModelConfigPath: config.legacyModelConfigPath,
    defaultProfile: {
      id: "default",
      name: "Default",
      protocol: config.defaultLlmProtocol === "anthropic" ? "anthropic" : "openai",
      baseUrl: config.defaultLlmBaseUrl,
      model: config.defaultLlmModel,
      apiKey: config.defaultLlmApiKey
    }
  });
  const runtimeConfig = settings.getRuntimeConfig();
  const llm = new LLMService({
    protocol: runtimeConfig.protocol,
    apiKey: runtimeConfig.apiKey,
    baseURL: runtimeConfig.baseUrl,
    model: runtimeConfig.model
  });

  // Phase 0 先内置几个工具声明，后续再接真实执行器。
  tools.register({
    name: "fs.read",
    description: "Read file contents"
  });
  tools.register({
    name: "fs.write",
    description: "Write file contents"
  });
  tools.register({
    name: "command.exec",
    description: "Execute terminal commands"
  });
  tools.register({
    name: "web.search",
    description: "Search the web"
  });
  tools.register({
    name: "web.fetch",
    description: "Fetch web pages"
  });
  tools.register({
    name: "memory.store",
    description: "Read and write simple memory"
  });

  app.register(cors, {
    origin: true
  });
  app.register(websocket);

  app.register(registerHealthRoutes, {
    appVersion: config.appVersion,
    getModel: () => llm.getModel(),
    getProtocol: () => llm.getProtocol(),
    getActiveSessions: () => sessions.listSize()
  });
  app.register(registerSettingsRoutes, {
    settings,
    llm
  });
  app.register(registerSessionRoutes, {
    sessions,
    tools
  });
  app.register(registerWsRoutes, {
    sessions,
    llm
  });

  return {
    app,
    config,
    llm
  };
}
