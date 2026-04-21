import type { FastifyPluginAsync } from "fastify";

import type { GatewayHealth } from "@selfme/protocol";

export const registerHealthRoutes: FastifyPluginAsync<{
  appVersion: string;
  getModel: () => string;
  getProtocol: () => string;
  getActiveSessions: () => number;
}> = async (
  app,
  input
) => {
  app.get<{ Reply: GatewayHealth }>("/health", async () => ({
    status: "ok",
    service: "gateway",
    version: input.appVersion,
    model: input.getModel(),
    activeSessions: input.getActiveSessions(),
    protocol: input.getProtocol()
  }));
};
