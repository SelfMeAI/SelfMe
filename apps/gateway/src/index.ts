import { createApp } from "./app.js";
import { logBanner, logError } from "./logger.js";

async function bootstrap(): Promise<void> {
  const { app, config, llm, settings } = createApp();
  const snapshot = settings.getSnapshot();

  try {
    logBanner({
      host: config.host,
      port: config.port,
      protocol: snapshot.model ? llm.getProtocol() : "Not configured",
      model: snapshot.model || "Not configured",
      version: config.appVersion,
      apiKeyConfigured: llm.hasApiKey(),
      baseUrl: llm.getBaseUrl()
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
