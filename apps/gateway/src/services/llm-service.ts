import OpenAI from "openai";

import { DEFAULT_ANTHROPIC_VERSION, type ChatMessage } from "@selfme/protocol";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

type SupportedProtocol = "openai" | "anthropic";

function normalizeProtocol(protocol: string): SupportedProtocol {
  return protocol.toLowerCase() === "anthropic" ? "anthropic" : "openai";
}

function buildAnthropicEndpoint(baseURL?: string): string {
  const normalizedBase = (baseURL || "https://api.anthropic.com").replace(/\/+$/, "");

  if (normalizedBase.endsWith("/v1/messages")) {
    return normalizedBase;
  }

  if (normalizedBase.endsWith("/v1")) {
    return `${normalizedBase}/messages`;
  }

  return `${normalizedBase}/v1/messages`;
}

function parseSseBlocks(chunk: string): { rest: string; blocks: string[] } {
  const normalized = chunk.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";

  return {
    rest,
    blocks
  };
}

function parseSseEvent(block: string): {
  event?: string;
  data?: string;
} {
  const lines = block.split("\n");
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    event: eventName,
    data: dataLines.length > 0 ? dataLines.join("\n") : undefined
  };
}

export class LLMService {
  private protocol: SupportedProtocol;
  private apiKey: string;
  private model: string;
  private baseURL?: string;
  private openaiClient?: OpenAI;
  private lastUsage: LLMUsage | null = null;

  public constructor(input: {
    protocol: string;
    apiKey: string;
    baseURL?: string;
    model: string;
  }) {
    this.protocol = normalizeProtocol(input.protocol);
    this.apiKey = input.apiKey;
    this.baseURL = input.baseURL;
    this.model = input.model;
    this.rebuildClient();
  }

  public getProtocol(): SupportedProtocol {
    return this.protocol;
  }

  public hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  public getModel(): string {
    return this.model;
  }

  public getBaseUrl(): string | undefined {
    return this.baseURL;
  }

  public setModel(model: string): void {
    this.model = model.trim();
  }

  public updateRuntimeConfig(input: {
    protocol: string;
    apiKey: string;
    baseURL?: string;
    model: string;
  }): void {
    this.protocol = normalizeProtocol(input.protocol);
    this.apiKey = input.apiKey;
    this.baseURL = input.baseURL;
    this.model = input.model.trim();
    this.rebuildClient();
  }

  public getLastUsage(): LLMUsage | null {
    return this.lastUsage;
  }

  public async *streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    if (!this.model.trim()) {
      throw new Error("LLM model is missing.");
    }

    if (!this.apiKey) {
      throw new Error("LLM API key is missing.");
    }

    this.lastUsage = null;

    if (this.protocol === "anthropic") {
      yield* this.streamAnthropic(messages, signal);
      return;
    }

    yield* this.streamOpenAI(messages, signal);
  }

  private async *streamOpenAI(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client is not initialized.");
    }

    let inputTokens = 0;
    let outputTokens = 0;

    const response = await this.openaiClient.chat.completions.create(
      {
        model: this.model,
        stream: true,
        stream_options: {
          include_usage: true
        },
        messages: messages.map((message) => ({
          role: message.role === "tool" ? "assistant" : message.role,
          content: message.content
        }))
      },
      {
        signal
      }
    );

    for await (const chunk of response) {
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }

      const delta = chunk.choices[0]?.delta?.content;

      if (delta) {
        yield delta;
      }
    }

    this.lastUsage = {
      inputTokens,
      outputTokens
    };
  }

  private rebuildClient(): void {
    if (this.protocol !== "openai") {
      this.openaiClient = undefined;
      return;
    }

    this.openaiClient = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL
    });
  }

  private async *streamAnthropic(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
    const systemMessage = messages.find((message) => message.role === "system")?.content ?? "";
    const anthropicMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "tool" ? "assistant" : message.role,
        content: message.content
      }));

    const response = await fetch(buildAnthropicEndpoint(this.baseURL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": DEFAULT_ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: this.model,
        messages: anthropicMessages,
        max_tokens: 4096,
        stream: true,
        ...(systemMessage ? { system: systemMessage } : {})
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic request failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    if (!response.body) {
      throw new Error("Anthropic streaming response is empty.");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      buffer += decoder.decode(value, {
        stream: true
      });

      const parsed = parseSseBlocks(buffer);
      buffer = parsed.rest;

      for (const block of parsed.blocks) {
        const event = parseSseEvent(block);

        if (!event.data || event.data === "[DONE]") {
          continue;
        }

        const payload = JSON.parse(event.data) as {
          type?: string;
          message?: {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
            };
          };
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
          };
          delta?: {
            type?: string;
            text?: string;
          };
          error?: {
            message?: string;
          };
        };

        const payloadType = payload.type ?? event.event;

        if (payloadType === "message_start") {
          inputTokens = payload.message?.usage?.input_tokens ?? inputTokens;
          outputTokens = payload.message?.usage?.output_tokens ?? outputTokens;
          continue;
        }

        if (payloadType === "message_delta") {
          inputTokens = payload.usage?.input_tokens ?? inputTokens;
          outputTokens = payload.usage?.output_tokens ?? outputTokens;
          continue;
        }

        if (payloadType === "content_block_delta" && payload.delta?.type === "text_delta" && payload.delta.text) {
          yield payload.delta.text;
          continue;
        }

        if (payloadType === "error") {
          throw new Error(payload.error?.message ?? "Anthropic streaming request failed.");
        }
      }
    }

    this.lastUsage = {
      inputTokens,
      outputTokens
    };
  }
}
