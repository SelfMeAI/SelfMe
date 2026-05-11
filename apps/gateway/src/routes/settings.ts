import type { FastifyPluginAsync } from "fastify";

import type { LLMSettings, UpdateLLMSettingsInput } from "@selfme/protocol";

import { logSuccess } from "../logger.js";
import type { LLMService } from "../services/llm-service.js";
import type { LLMSettingsStore } from "../services/llm-settings-store.js";

export const registerSettingsRoutes: FastifyPluginAsync<{
  settings: LLMSettingsStore;
  llm: LLMService;
}> = async (
  app,
  input
) => {
  app.get<{ Reply: LLMSettings }>("/api/settings/llm", async () => input.settings.getSnapshot());

  app.put<{
    Body: UpdateLLMSettingsInput;
    Reply: LLMSettings;
  }>("/api/settings/llm", async (request, reply) => {
    const normalizedModel = request.body.model?.trim() ?? "";

    if (!normalizedModel) {
      reply.status(400);
      throw new Error("Model is required.");
    }

    const snapshot = await input.settings.update({
      protocol: request.body.protocol,
      baseUrl: request.body.baseUrl,
      model: normalizedModel,
      apiKey: request.body.apiKey
    });

    const runtimeConfig = input.settings.getRuntimeConfig();
    input.llm.updateRuntimeConfig({
      protocol: runtimeConfig.protocol,
      apiKey: runtimeConfig.apiKey,
      baseURL: runtimeConfig.baseUrl,
      model: runtimeConfig.model
    });

    logSuccess("LLM settings updated", {
      protocol: snapshot.protocol,
      model: snapshot.model
    });

    return snapshot;
  });
};
