import { createApp } from "./app.js";
import { logBanner, logError } from "./logger.js";

async function bootstrap(): Promise<void> {
  const { app, config, llm } = createApp();

  try {
    logBanner({
      host: config.host,
      port: config.port,
      protocol: llm.getProtocol(),
      model: llm.getModel(),
      version: config.appVersion,
      apiKeyConfigured: llm.hasApiKey()
    });

    await app.listen({
      host: config.host,
      port: config.port
    });
  } catch (error) {
    logError(error instanceof Error ? error.message : "Gateway failed to start");
    process.exit(1);
  }
}

void bootstrap();
