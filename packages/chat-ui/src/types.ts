import type { LLMSettings } from "@selfme/protocol";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  streaming?: boolean;
  placeholder?: boolean;
  metadata?: string;
}

export interface WebAppConfig {
  version: string;
  model: string;
}

export type WorkspaceView = "chat" | "settings";

export type LLMSettingsState = LLMSettings;
