import { useCallback, useEffect, useRef, useState } from "react";
import WebSocket from "ws";

import type { CreateSessionOutput, GatewayServerEvent } from "@selfme/protocol";

export interface TuiMessage {
  id: string;
  role: "user" | "assistant" | "error" | "system";
  content: string;
  metadata?: string;
  streaming?: boolean;
}

export interface TuiConfig {
  version: string;
  model: string;
}

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSessionId(): string {
  return `tui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWsUrl(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/^http/i, "ws");

  if (normalizedBase.endsWith("/ws")) {
    return normalizedBase;
  }

  return normalizedBase.endsWith("/")
    ? `${normalizedBase}ws`
    : `${normalizedBase}/ws`;
}

export function useGatewayChat() {
  const gatewayHttpUrl = process.env.SELFME_GATEWAY_HTTP_URL ?? "http://localhost:8000";
  const gatewayWsBaseUrl = process.env.SELFME_GATEWAY_WS_URL ?? gatewayHttpUrl.replace(/^http/, "ws");

  const [config, setConfig] = useState<TuiConfig>({
    version: "2026.5.11",
    model: "Loading..."
  });
  const [messages, setMessages] = useState<TuiMessage[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const sessionIdRef = useRef(createSessionId());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const isGeneratingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const configRef = useRef(config);
  const shouldReconnectRef = useRef(true);
  const sessionReadyRef = useRef(false);
  const reconnectNoticeShownRef = useRef(false);

  const updateAssistantContent = useCallback((delta: string) => {
    if (!currentAssistantIdRef.current) {
      const assistantId = createMessageId("assistant");
      currentAssistantIdRef.current = assistantId;

      setMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          content: delta,
          streaming: true
        }
      ]);
      return;
    }

    const currentAssistantId = currentAssistantIdRef.current;

    setMessages((current) =>
      current.map((message) =>
        message.id === currentAssistantId
          ? {
              ...message,
              content: `${message.content}${delta}`,
              streaming: true
            }
          : message
      )
    );
  }, []);

  const finalizeCurrentAssistant = useCallback((input?: { metadata?: string }) => {
    const currentAssistantId = currentAssistantIdRef.current;

    if (currentAssistantId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === currentAssistantId
            ? {
                ...message,
                streaming: false,
                metadata: input?.metadata ?? message.metadata
              }
            : message
        )
      );
    }

    currentAssistantIdRef.current = null;
    setIsGenerating(false);
  }, []);

  const processNextMessage = useCallback(() => {
    if (
      isGeneratingRef.current
      || queueRef.current.length === 0
      || !sessionReadyRef.current
      || !socketRef.current
      || socketRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const [nextMessage, ...rest] = queueRef.current;
    queueRef.current = rest;
    setQueue(rest);

    if (!nextMessage) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: createMessageId("user"),
        role: "user",
        content: nextMessage
      },
      {
        id: (() => {
          const assistantId = createMessageId("assistant");
          currentAssistantIdRef.current = assistantId;
          return assistantId;
        })(),
        role: "assistant",
        content: "",
        streaming: true
      }
    ]);
    setIsGenerating(true);

    socketRef.current.send(
      JSON.stringify({
        type: "chat.send",
        sessionId: sessionIdRef.current,
        content: nextMessage
      })
    );
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch(`${gatewayHttpUrl}/health`);
      const data = (await response.json()) as { version?: string; model?: string };

      setConfig({
        version: data.version ?? "2026.5.11",
        model: data.model ?? "Unknown"
      });
    } catch {
      setConfig({
        version: "2026.5.11",
        model: "Disconnected"
      });
    }
  }, [gatewayHttpUrl]);

  const connect = useCallback(async () => {
    try {
      const sessionResponse = await fetch(`${gatewayHttpUrl}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          clientType: "tui"
        })
      });
      const sessionData = (await sessionResponse.json()) as CreateSessionOutput;
      sessionIdRef.current = sessionData.session.sessionId;

      const socket = new WebSocket(normalizeWsUrl(gatewayWsBaseUrl));
      socketRef.current = socket;
      sessionReadyRef.current = false;

      socket.on("open", () => {
        setConnected(true);
        reconnectNoticeShownRef.current = false;
        socket.send(
          JSON.stringify({
            type: "session.attach",
            sessionId: sessionIdRef.current
          })
        );
      });

      socket.on("close", () => {
        setConnected(false);
        sessionReadyRef.current = false;

        if (!shouldReconnectRef.current) {
          return;
        }

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }

        reconnectTimerRef.current = setTimeout(() => {
          void connect();
        }, 3000);
      });

      socket.on("message", (value) => {
        const payload = JSON.parse(value.toString()) as GatewayServerEvent;

        if (payload.type === "session.ready") {
          sessionReadyRef.current = true;
          processNextMessage();
          return;
        }

        if (payload.type === "chat.chunk") {
          updateAssistantContent(payload.delta);
          return;
        }

        if (payload.type === "chat.completed") {
          const metadataText = `🐙 ${payload.usage?.responseTime ?? 0}s · ↑${payload.usage?.inputTokens ?? 0} ↓${payload.usage?.outputTokens ?? 0} · ${payload.usage?.model ?? configRef.current.model}`;

          finalizeCurrentAssistant({
            metadata: metadataText
          });
          processNextMessage();
          return;
        }

        if (payload.type === "chat.cancelled") {
          finalizeCurrentAssistant({
            metadata: "🚫 Cancelled"
          });
          processNextMessage();
          return;
        }

        if (payload.type === "error") {
          setMessages((current) => [
            ...current,
            {
              id: createMessageId("error"),
              role: "error",
              content: `Error: ${payload.message || "Unknown error"}`
            }
          ]);
          finalizeCurrentAssistant();
          processNextMessage();
        }
      });
    } catch (error) {
      setConnected(false);
      sessionReadyRef.current = false;
      if (!reconnectNoticeShownRef.current) {
        reconnectNoticeShownRef.current = true;
        setMessages((current) => [
          ...current,
          {
            id: createMessageId("system"),
            role: "system",
            content: `Gateway unavailable: ${error instanceof Error ? error.message : "Unknown error"}`
          }
        ]);
      }

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = setTimeout(() => {
        void connect();
      }, 3000);
    }
  }, [finalizeCurrentAssistant, gatewayHttpUrl, gatewayWsBaseUrl, processNextMessage, updateAssistantContent]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    void loadConfig();
    void connect();

    return () => {
      shouldReconnectRef.current = false;
      sessionReadyRef.current = false;
      socketRef.current?.close();

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [connect, loadConfig]);

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId("error"),
          role: "error",
          content: "Not connected to gateway"
        }
      ]);
      return;
    }

    if (!sessionReadyRef.current || isGeneratingRef.current) {
      setHasSentMessage(true);
      setQueue((current) => {
        const next = [...current, trimmed];
        queueRef.current = next;
        return next;
      });
      return;
    }

    setHasSentMessage(true);
    const assistantId = createMessageId("assistant");
    currentAssistantIdRef.current = assistantId;

    setMessages((current) => [
      ...current,
      {
        id: createMessageId("user"),
        role: "user",
        content: trimmed
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true
      }
    ]);
    setIsGenerating(true);

    socketRef.current.send(
      JSON.stringify({
        type: "chat.send",
        sessionId: sessionIdRef.current,
        content: trimmed
      })
    );
  }, []);

  const cancelGeneration = useCallback(() => {
    if (!sessionIdRef.current) {
      return;
    }

    socketRef.current?.send(JSON.stringify({
      type: "chat.cancel",
      sessionId: sessionIdRef.current
    }));
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }

    sessionReadyRef.current = false;
    socketRef.current?.close();
  }, []);

  const addLocalSystemMessage = useCallback((content: string) => {
    setMessages((current) => [
      ...current,
      {
        id: createMessageId("system"),
        role: "system",
        content
      }
    ]);
  }, []);

  return {
    config,
    messages,
    queue,
    connected,
    isGenerating,
    hasSentMessage,
    sendMessage,
    cancelGeneration,
    disconnect,
    addLocalSystemMessage
  };
}
