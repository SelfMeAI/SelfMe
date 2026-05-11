export type ClientType = "web" | "desktop" | "tui" | "unknown";

export const DEFAULT_GATEWAY_HOST = "0.0.0.0";
export const DEFAULT_GATEWAY_PORT = 8000;
export const DEFAULT_GATEWAY_HTTP_URL = "http://127.0.0.1:8000";
export const DEFAULT_GATEWAY_WS_URL = "ws://127.0.0.1:8000/ws";
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
}

export interface SessionSummary {
  sessionId: string;
  clientType: ClientType;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface CreateSessionInput {
  sessionId?: string;
  clientType?: ClientType;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionOutput {
  session: SessionSummary;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface GatewayHealth {
  status: "ok";
  service: "gateway";
  version: string;
  model: string;
  activeSessions: number;
  protocol?: string;
}

export type LLMProtocol = "openai" | "anthropic";

export interface LLMSettings {
  protocol: LLMProtocol;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  maskedApiKey?: string;
  settingsPath: string;
  persistedSettings: boolean;
}

export interface UpdateLLMSettingsInput {
  protocol: LLMProtocol;
  baseUrl?: string;
  model: string;
  apiKey?: string;
}

export interface SessionAttachEvent {
  type: "session.attach";
  sessionId: string;
}

export interface ChatSendEvent {
  type: "chat.send";
  sessionId: string;
  requestId?: string;
  content: string;
}

export interface ChatCancelEvent {
  type: "chat.cancel";
  sessionId: string;
  requestId?: string;
}

export interface MemoryClearEvent {
  type: "memory.clear";
  sessionId: string;
}

export interface PingEvent {
  type: "ping";
}

export type GatewayClientEvent =
  | SessionAttachEvent
  | ChatSendEvent
  | ChatCancelEvent
  | MemoryClearEvent
  | PingEvent;

export interface SessionReadyEvent {
  type: "session.ready";
  session: SessionSummary;
}

export interface ChatAcceptedEvent {
  type: "chat.accepted";
  sessionId: string;
  requestId?: string;
  content: string;
}

export interface ChatChunkEvent {
  type: "chat.chunk";
  sessionId: string;
  requestId?: string;
  delta: string;
}

export interface ChatCompletedEvent {
  type: "chat.completed";
  sessionId: string;
  requestId?: string;
  message: ChatMessage;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    responseTime?: number;
    model?: string;
  };
}

export interface ChatCancelledEvent {
  type: "chat.cancelled";
  sessionId: string;
  requestId?: string;
}

export interface MemoryClearedEvent {
  type: "memory.cleared";
  sessionId: string;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
  sessionId?: string;
  requestId?: string;
}

export interface PongEvent {
  type: "pong";
}

export type GatewayServerEvent =
  | SessionReadyEvent
  | ChatAcceptedEvent
  | ChatChunkEvent
  | ChatCompletedEvent
  | ChatCancelledEvent
  | MemoryClearedEvent
  | ErrorEvent
  | PongEvent;
