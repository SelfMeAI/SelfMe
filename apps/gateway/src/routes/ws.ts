import type { FastifyInstance, FastifyPluginAsync } from "fastify";

import type {
  ChatCompletedEvent,
  GatewayClientEvent,
  GatewayServerEvent,
  SessionSummary
} from "@selfme/protocol";

import { logError, logInfo, logSuccess, logWarning } from "../logger.js";
import type { LLMService } from "../services/llm-service.js";
import type { SessionStore } from "../services/session-store.js";

type WsConnection = { send: (payload: string) => void; on: (event: "message", cb: (payload: Buffer) => void | Promise<void>) => void };

function send(connection: WsConnection, event: GatewayServerEvent): void {
  connection.send(JSON.stringify(event));
}

function ensureSessionSummary(session?: SessionSummary): SessionSummary {
  if (!session) {
    throw new Error("The current connection is not attached to a session.");
  }

  return session;
}

function sendAccepted(connection: WsConnection, input: { sessionId: string; requestId?: string; content: string }): void {
  send(connection, {
    type: "chat.accepted",
    sessionId: input.sessionId,
    requestId: input.requestId,
    content: input.content
  });
}

function sendChunk(connection: WsConnection, input: { sessionId: string; requestId?: string; delta: string }): void {
  send(connection, {
    type: "chat.chunk",
    sessionId: input.sessionId,
    requestId: input.requestId,
    delta: input.delta
  });
}

function sendCancelled(connection: WsConnection, input: { sessionId: string; requestId?: string }): void {
  send(connection, {
    type: "chat.cancelled",
    sessionId: input.sessionId,
    requestId: input.requestId
  });
}

function sendCleared(connection: WsConnection, input: { sessionId: string }): void {
  send(connection, {
    type: "memory.cleared",
    sessionId: input.sessionId
  });
}

function sendCompleted(
  connection: WsConnection,
  input: {
    sessionId: string;
    requestId?: string;
    message: { id: string; role: "assistant"; content: string; createdAt: string };
    usage: {
      inputTokens: number;
      outputTokens: number;
      responseTime: number;
      model: string;
    };
  }
): void {
  const completed: ChatCompletedEvent = {
    type: "chat.completed",
    sessionId: input.sessionId,
    requestId: input.requestId,
    message: input.message,
    usage: input.usage
  };

  send(connection, completed);
}

function sendError(
  connection: WsConnection,
  input: {
    message: string;
    code?: string;
    sessionId?: string;
    requestId?: string;
  }
): void {
  send(connection, {
    type: "error",
    code: input.code ?? "GATEWAY_RUNTIME_ERROR",
    message: input.message,
    sessionId: input.sessionId,
    requestId: input.requestId
  });
}

function bindSession(input: { sessions: SessionStore; sessionId: string }): SessionSummary {
  const record = input.sessions.createOrGet({
    sessionId: input.sessionId
  });

  return record.summary;
}

function summarizeMessagePreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= 64) {
    return normalized;
  }

  return `${normalized.slice(0, 61)}...`;
}

async function handleChatSend(input: {
  connection: WsConnection;
  sessions: SessionStore;
  llm: LLMService;
  session: SessionSummary;
  content: string;
  requestId?: string;
  currentAbortControllerRef: { current?: AbortController };
}): Promise<void> {
  const record = input.sessions.get(input.session.sessionId);

  if (!record) {
    sendError(input.connection, {
      code: "SESSION_NOT_FOUND",
      message: "Session not found.",
      sessionId: input.session.sessionId,
      requestId: input.requestId
    });
    return;
  }

  const activeRecord = record;

  activeRecord.memory.append("user", input.content);
  activeRecord.summary.messageCount = activeRecord.memory.list().length;
  logInfo("Message received", {
    session: input.session.sessionId.slice(0, 8),
    request: input.requestId ?? "-",
    chars: input.content.length,
    preview: summarizeMessagePreview(input.content)
  });

  sendAccepted(input.connection, {
    sessionId: activeRecord.summary.sessionId,
    requestId: input.requestId,
    content: input.content
  });

  input.currentAbortControllerRef.current = new AbortController();
  const startedAt = Date.now();
  let fullContent = "";
  logInfo("Generation started", {
    session: activeRecord.summary.sessionId.slice(0, 8),
    request: input.requestId ?? "-",
    protocol: input.llm.getProtocol(),
    model: input.llm.getModel()
  });

  function finalizeCancelledResponse(): void {
    if (fullContent) {
      activeRecord.memory.append("assistant", `${fullContent} [cancelled]`);
      activeRecord.summary.messageCount = activeRecord.memory.list().length;
    }

    sendCancelled(input.connection, {
      sessionId: activeRecord.summary.sessionId,
      requestId: input.requestId
    });
    logWarning("Generation cancelled", {
      session: activeRecord.summary.sessionId.slice(0, 8),
      request: input.requestId ?? "-",
      elapsed_s: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
      partial_chars: fullContent.length
    });
    input.currentAbortControllerRef.current = undefined;
  }

  try {
    for await (const delta of input.llm.streamChat(activeRecord.memory.list(), input.currentAbortControllerRef.current.signal)) {
      fullContent += delta;
      sendChunk(input.connection, {
        sessionId: activeRecord.summary.sessionId,
        requestId: input.requestId,
        delta
      });
    }
  } catch (error) {
    if (input.currentAbortControllerRef.current?.signal.aborted) {
      finalizeCancelledResponse();
      return;
    }

    throw error;
  }

  if (input.currentAbortControllerRef.current?.signal.aborted) {
    finalizeCancelledResponse();
    return;
  }

  const assistantMessage = activeRecord.memory.append("assistant", fullContent);
  activeRecord.summary.messageCount = activeRecord.memory.list().length;
  input.currentAbortControllerRef.current = undefined;

  sendCompleted(input.connection, {
    sessionId: activeRecord.summary.sessionId,
    requestId: input.requestId,
    message: {
      id: assistantMessage.id,
      role: "assistant",
      content: assistantMessage.content,
      createdAt: assistantMessage.createdAt
    },
    usage: {
      inputTokens: input.llm.getLastUsage()?.inputTokens ?? 0,
      outputTokens: input.llm.getLastUsage()?.outputTokens ?? 0,
      responseTime: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
      model: input.llm.getModel()
    }
  });
  logSuccess("Response completed", {
    session: activeRecord.summary.sessionId.slice(0, 8),
    request: input.requestId ?? "-",
    elapsed_s: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
    model: input.llm.getModel(),
    input_tokens: input.llm.getLastUsage()?.inputTokens ?? 0,
    output_tokens: input.llm.getLastUsage()?.outputTokens ?? 0
  });
}

function registerSocketRoute(input: {
  app: FastifyInstance;
  path: string;
  sessions: SessionStore;
  llm: LLMService;
}): void {
  input.app.get(
    input.path,
    { websocket: true },
    (connection: WsConnection) => {
      let currentSession: SessionSummary | undefined;
      const currentAbortControllerRef: { current?: AbortController } = {};

      connection.on("message", async (rawMessage) => {
        try {
          const payload = JSON.parse(rawMessage.toString()) as GatewayClientEvent;

          if (payload.type === "ping") {
            send(connection, { type: "pong" });
            return;
          }

          if (payload.type === "session.attach") {
            currentSession = bindSession({
              sessions: input.sessions,
              sessionId: payload.sessionId
            });

            send(connection, {
              type: "session.ready",
              session: currentSession
            });
            return;
          }

          if (payload.type === "memory.clear") {
            const session = input.sessions.clearMessages(payload.sessionId);

            if (!session) {
              sendError(connection, {
                code: "SESSION_NOT_FOUND",
                message: "Session not found.",
                sessionId: payload.sessionId
              });
              return;
            }

            sendCleared(connection, { sessionId: payload.sessionId });
            return;
          }

          if (payload.type === "chat.cancel") {
            currentAbortControllerRef.current?.abort();
            return;
          }

          if (payload.type === "chat.send") {
            if (!currentSession || currentSession.sessionId !== payload.sessionId) {
              currentSession = bindSession({
                sessions: input.sessions,
                sessionId: payload.sessionId
              });
            }

            const session = ensureSessionSummary(currentSession);
            const content = payload.content.trim();

            if (!content) {
              return;
            }

            await handleChatSend({
              connection,
              sessions: input.sessions,
              llm: input.llm,
              session,
              content,
              requestId: payload.requestId,
              currentAbortControllerRef
            });
          }
        } catch (error) {
          logError("Gateway runtime error", {
            session: currentSession?.sessionId?.slice(0, 8) ?? "-",
            error: error instanceof Error ? error.message : "Unknown error"
          });
          sendError(connection, {
            code: "GATEWAY_RUNTIME_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
            sessionId: currentSession?.sessionId
          });
        }
      });
    }
  );
}

export const registerWsRoutes: FastifyPluginAsync<{
  sessions: SessionStore;
  llm: LLMService;
}> = async (
  app,
  input
) => {
  registerSocketRoute({
    app,
    path: "/ws",
    sessions: input.sessions,
    llm: input.llm
  });
};
