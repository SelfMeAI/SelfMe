import type { FastifyPluginAsync } from "fastify";

import type { CreateSessionInput, CreateSessionOutput, SessionSummary, ToolDefinition } from "@selfme/protocol";

import { logInfo } from "../logger.js";
import type { SessionStore } from "../services/session-store.js";
import type { ToolRegistry } from "../services/tool-registry.js";

export const registerSessionRoutes: FastifyPluginAsync<{
  sessions: SessionStore;
  tools: ToolRegistry;
}> = async (
  app,
  input
) => {
  app.post<{
    Body: CreateSessionInput;
    Reply: CreateSessionOutput;
  }>("/api/sessions", async (request) => {
    const body = request.body;
    const record = input.sessions.createOrGet({
      sessionId: body.sessionId,
      clientType: body.clientType,
      metadata: body.metadata ?? {}
    });
    record.summary.messageCount = record.memory.list().length;
    logInfo("Session created", {
      client: record.summary.clientType,
      session: record.summary.sessionId.slice(0, 8)
    });

    return {
      session: record.summary
    };
  });

  app.get<{ Params: { sessionId: string }; Reply: SessionSummary }>("/api/sessions/:sessionId", async (request, reply) => {
    const record = input.sessions.get(request.params.sessionId);

    if (!record) {
      reply.status(404);
      throw new Error("Session not found.");
    }

    return record.summary;
  });

  app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/messages", async (request, reply) => {
    const record = input.sessions.get(request.params.sessionId);

    if (!record) {
      reply.status(404);
      throw new Error("Session not found.");
    }

    return {
      messages: record.memory.list()
    };
  });

  app.get<{ Reply: { tools: ToolDefinition[] } }>("/api/tools", async () => ({
    tools: input.tools.list()
  }));
};
