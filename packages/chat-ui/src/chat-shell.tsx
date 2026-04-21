"use client";

import { useEffect, useRef, useState } from "react";

import type { CreateSessionOutput, GatewayServerEvent, LLMSettings, UpdateLLMSettingsInput } from "@selfme/protocol";

import { ChatContainer } from "./chat-container";
import { NavBar } from "./nav-bar";
import type { UIMessage, WebAppConfig, WorkspaceView } from "./types";

function createSessionId(clientType: "web" | "desktop"): string {
  return `${clientType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWsUrl(input: string): string {
  const normalizedScheme = input.replace(/^http/i, "ws");

  if (normalizedScheme.endsWith("/ws")) {
    return normalizedScheme;
  }

  if (normalizedScheme.endsWith("/")) {
    return `${normalizedScheme}ws`;
  }

  return `${normalizedScheme}/ws`;
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const data = await response.json() as { message?: string };
    return data.message || fallbackMessage;
  } catch {
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }
}

export interface ChatShellProps {
  clientType?: "web" | "desktop";
  gatewayHttpUrl?: string;
  gatewayWsUrl?: string;
  logoSrc?: string;
}

export function ChatShell({
  clientType = "web",
  gatewayHttpUrl = "http://localhost:8000",
  gatewayWsUrl = "ws://localhost:8000/ws",
  logoSrc = "/assets/logo.jpg"
}: ChatShellProps) {
  const [config, setConfig] = useState<WebAppConfig>({ version: "", model: "Loading..." });
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const [modelSettings, setModelSettings] = useState<LLMSettings | null>(null);
  const [isSavingModelSettings, setIsSavingModelSettings] = useState(false);
  const isStreamingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const updateTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pendingContentRef = useRef("");
  const lastUpdateTimeRef = useRef(0);
  const isProcessingQueueRef = useRef(false);
  const shouldReconnectRef = useRef(true);
  const sessionReadyRef = useRef(false);

  async function loadConfig() {
    try {
      const response = await fetch(`${gatewayHttpUrl}/health`);
      const data = (await response.json()) as { version?: string; model?: string };

      setConfig({
        version: data.version ?? "2026.4.21",
        model: data.model ?? "Unknown"
      });
    } catch {
      setConfig({
        version: "2026.4.21",
        model: "Disconnected"
      });
    }
  }

  async function loadModelSettings() {
    const response = await fetch(`${gatewayHttpUrl}/api/settings/llm`);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to load model settings."));
    }

    const data = (await response.json()) as LLMSettings;
    setModelSettings(data);
  }

  async function saveModelSettings(input: UpdateLLMSettingsInput) {
    setIsSavingModelSettings(true);

    try {
      const response = await fetch(`${gatewayHttpUrl}/api/settings/llm`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input satisfies UpdateLLMSettingsInput)
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to save model settings."));
      }

      const data = (await response.json()) as LLMSettings;
      setModelSettings(data);
      setConfig((current) => ({
        ...current,
        model: data.model
      }));
    } finally {
      setIsSavingModelSettings(false);
    }
  }

  async function createSession() {
    const response = await fetch(`${gatewayHttpUrl}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId: sessionIdRef.current ?? undefined,
        clientType
      })
    });
    const data = (await response.json()) as CreateSessionOutput;

    sessionIdRef.current = data.session.sessionId;
    return sessionIdRef.current;
  }

  function beginStreaming() {
    isStreamingRef.current = true;
    setIsStreaming(true);
  }

  function endStreaming() {
    isStreamingRef.current = false;
    setIsStreaming(false);
    queueMicrotask(() => {
      processNextMessage();
    });
  }

  function updateQueue(updater: (current: string[]) => string[]): string[] {
    const next = updater(messageQueueRef.current);
    messageQueueRef.current = next;
    setMessageQueue(next);
    return next;
  }

  function formatUsageMetadata(input?: {
    responseTime?: number;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }): string {
    const inputTokens = input?.inputTokens ?? 0;
    const outputTokens = input?.outputTokens ?? 0;
    const model = input?.model ?? config.model;

    return `${inputTokens} in · ${outputTokens} out · ${model}`;
  }

  function formatErrorMetadata(message: string): string {
    const normalized = message.trim().replace(/\s+/g, " ");

    if (!normalized) {
      return "Error";
    }

    if (normalized.length <= 120) {
      return `Error · ${normalized}`;
    }

    return `Error · ${normalized.slice(0, 117)}...`;
  }

  function updateMessageContent() {
    const currentMessageId = currentMessageIdRef.current;

    if (!currentMessageId || !pendingContentRef.current) {
      return;
    }

    const content = pendingContentRef.current;
    lastUpdateTimeRef.current = Date.now();

    setMessages((current) =>
      current.map((message) =>
        message.id === currentMessageId
          ? {
              ...message,
              content
            }
          : message
      )
    );
  }

  function processNextMessage() {
    if (isProcessingQueueRef.current || isStreamingRef.current) {
      return;
    }

    if (messageQueueRef.current.length === 0) {
      return;
    }

    isProcessingQueueRef.current = true;
    const [nextMessage, ...rest] = messageQueueRef.current;
    updateQueue(() => rest);

    queueMicrotask(() => {
      const accepted = sendMessage(nextMessage, true);

      if (!accepted) {
        updateQueue((retry) => [nextMessage, ...retry]);
      }

      isProcessingQueueRef.current = false;
    });
  }

  function handleCancelled() {
    if (updateTimerRef.current !== null) {
      window.clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }

    updateMessageContent();

    if (currentMessageIdRef.current) {
      const currentMessageId = currentMessageIdRef.current;
      setMessages((current) =>
        current.map((message) =>
          message.id === currentMessageId
            ? {
                ...message,
                streaming: false,
                metadata: "Cancelled"
              }
            : message
        )
      );
    }

    currentMessageIdRef.current = null;
    pendingContentRef.current = "";
    endStreaming();
  }

  function handleChunk(chunk: string) {
    if (!currentMessageIdRef.current) {
      const messageId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      currentMessageIdRef.current = messageId;
      pendingContentRef.current = "";
      lastUpdateTimeRef.current = Date.now();

      setMessages((current) => [
        ...current,
        {
          id: messageId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: true
        }
      ]);
    }

    pendingContentRef.current += chunk;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

    if (timeSinceLastUpdate >= 50) {
      updateMessageContent();
      if (updateTimerRef.current !== null) {
        window.clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    } else if (updateTimerRef.current === null) {
      updateTimerRef.current = window.setTimeout(() => {
        updateMessageContent();
        updateTimerRef.current = null;
      }, 50 - timeSinceLastUpdate);
    }
  }

  function handleComplete(metadata?: {
    responseTime?: number;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }, fallbackContent?: string) {
    if (updateTimerRef.current !== null) {
      window.clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }

    updateMessageContent();

    if (currentMessageIdRef.current) {
      const currentMessageId = currentMessageIdRef.current;
      const metadataText = formatUsageMetadata(metadata);

      setMessages((current) =>
        current.map((message) =>
          message.id === currentMessageId
            ? {
                ...message,
                streaming: false,
                content: pendingContentRef.current || fallbackContent || message.content,
                metadata: metadataText
              }
            : message
        )
      );
    }

    currentMessageIdRef.current = null;
    pendingContentRef.current = "";
    endStreaming();
  }

  function handleError(message: string) {
    if (updateTimerRef.current !== null) {
      window.clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }

    updateMessageContent();

    if (currentMessageIdRef.current) {
      const currentMessageId = currentMessageIdRef.current;

      setMessages((current) =>
        current.map((item) =>
          item.id === currentMessageId
            ? {
                ...item,
                streaming: false,
                metadata: formatErrorMetadata(message)
              }
            : item
        )
      );
    }

    currentMessageIdRef.current = null;
    pendingContentRef.current = "";
    endStreaming();
  }

  function handleMessage(payload: GatewayServerEvent) {
    if (payload.type === "session.ready") {
      sessionReadyRef.current = true;
      queueMicrotask(() => {
        processNextMessage();
      });
      return;
    }

    if (payload.type === "chat.accepted" || payload.type === "memory.cleared" || payload.type === "pong") {
      return;
    }

    if (payload.type === "chat.cancelled") {
      handleCancelled();
      return;
    }

    if (payload.type === "chat.chunk") {
      handleChunk(payload.delta);
      return;
    }

    if (payload.type === "chat.completed") {
      handleComplete({
        responseTime: payload.usage?.responseTime,
        model: payload.usage?.model,
        inputTokens: payload.usage?.inputTokens,
        outputTokens: payload.usage?.outputTokens
      }, payload.message.content);
      return;
    }

    if (payload.type === "error") {
      handleError(payload.message || "Unknown error");
    }
  }

  async function connectWebSocket() {
    if (!sessionIdRef.current) {
      await createSession();
    }

    const socket = new WebSocket(normalizeWsUrl(gatewayWsUrl));
    socketRef.current = socket;
    sessionReadyRef.current = false;

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(
        JSON.stringify({
          type: "session.attach",
          sessionId: sessionIdRef.current
        })
      );
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as GatewayServerEvent;
      handleMessage(payload);
    };

    socket.onerror = () => {
      setIsConnected(false);
    };

    socket.onclose = () => {
      setIsConnected(false);
      sessionReadyRef.current = false;

      if (!shouldReconnectRef.current) {
        return;
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        void connectWebSocket();
      }, 3000);
    };
  }

  function stopGeneration() {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !sessionIdRef.current) {
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        type: "chat.cancel",
        sessionId: sessionIdRef.current
      })
    );
  }

  function sendMessage(text: string, fromQueue = false): boolean {
    const trimmed = text.trim();

    if (!trimmed) {
      return false;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !sessionIdRef.current || !sessionReadyRef.current) {
      if (!fromQueue) {
        updateQueue((current) => [...current, trimmed]);
        return true;
      }

      return false;
    }

    if ((isStreamingRef.current || messageQueueRef.current.length > 0) && !fromQueue) {
      updateQueue((current) => [...current, trimmed]);
      return true;
    }

    beginStreaming();

    const userMessage: UIMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    const placeholderId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const placeholder: UIMessage = {
      id: placeholderId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      placeholder: true
    };

    currentMessageIdRef.current = placeholderId;
    pendingContentRef.current = "";
    lastUpdateTimeRef.current = Date.now();

    setMessages((current) => [...current, userMessage, placeholder]);

    socketRef.current.send(
      JSON.stringify({
        type: "chat.send",
        sessionId: sessionIdRef.current,
        content: trimmed
      })
    );

    return true;
  }
  useEffect(() => {
    shouldReconnectRef.current = true;
    sessionIdRef.current = createSessionId(clientType);
    messageQueueRef.current = [];
    void loadConfig();
    void loadModelSettings().catch(() => undefined);
    void connectWebSocket();

    return () => {
      shouldReconnectRef.current = false;
      sessionReadyRef.current = false;
      socketRef.current?.close();

      if (updateTimerRef.current !== null) {
        window.clearTimeout(updateTimerRef.current);
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [gatewayHttpUrl, gatewayWsUrl, clientType]);

  useEffect(() => {
    function handleGlobalKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && isStreamingRef.current) {
        event.preventDefault();
        stopGeneration();
      }
    }

    window.addEventListener("keydown", handleGlobalKeydown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
    };
  }, []);

  return (
    <div className={`app-container app-container-${clientType}`.trim()}>
      <NavBar
        model={config.model}
        logoSrc={logoSrc}
        connected={isConnected}
      />
      {!isConnected ? (
        <div className="connection-banner">
          <div className="banner-content">
            <span className="status-icon">⚠</span>
            <span className="status-text">Gateway disconnected. Reconnecting quietly in the background.</span>
          </div>
        </div>
      ) : null}

      <ChatContainer
        messages={messages}
        isStreaming={isStreaming}
        messageQueue={messageQueue}
        version={config.version}
        activeView={activeView}
        modelSettings={modelSettings}
        isSavingModelSettings={isSavingModelSettings}
        onViewChange={setActiveView}
        onSaveModelSettings={saveModelSettings}
        onSend={sendMessage}
        onStop={stopGeneration}
      />
    </div>
  );
}
