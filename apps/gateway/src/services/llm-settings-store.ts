import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { LLMProtocol, LLMSettings } from "@selfme/protocol";

interface StoredSettingsFile {
  protocol?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

interface RuntimeSettings {
  protocol: LLMProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ActiveLLMRuntimeConfig {
  protocol: LLMProtocol;
  baseUrl?: string;
  model: string;
  apiKey: string;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeProtocol(protocol: string | undefined, fallback: LLMProtocol): LLMProtocol {
  return protocol?.toLowerCase() === "anthropic" ? "anthropic" : fallback;
}

function normalizeSettings(
  input: {
    protocol?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  },
  fallback: RuntimeSettings
): RuntimeSettings {
  return {
    protocol: normalizeProtocol(input.protocol, fallback.protocol),
    baseUrl: input.baseUrl?.trim() ?? fallback.baseUrl,
    model: input.model?.trim() || fallback.model,
    apiKey: input.apiKey?.trim() || fallback.apiKey
  };
}

function hasStoredSettings(input: StoredSettingsFile | null): input is StoredSettingsFile {
  return Boolean(input && (
    typeof input.protocol === "string"
    || typeof input.baseUrl === "string"
    || typeof input.model === "string"
    || typeof input.apiKey === "string"
  ));
}

function maskApiKey(apiKey: string): string {
  const normalized = apiKey.trim();

  if (!normalized) {
    return "";
  }

  const suffix = normalized.slice(-4);
  return suffix ? `Stored **** ${suffix}` : "Stored ****";
}

export class LLMSettingsStore {
  private readonly settingsPath: string;
  private settings: RuntimeSettings;
  private persistedSettings: boolean;

  public constructor(input: {
    settingsPath: string;
  }) {
    this.settingsPath = input.settingsPath;

    const emptySettings: RuntimeSettings = {
      protocol: "openai",
      baseUrl: "",
      model: "",
      apiKey: ""
    };

    const storedSettings = readJsonFile<StoredSettingsFile>(input.settingsPath);

    this.persistedSettings = existsSync(input.settingsPath);
    this.settings = normalizeSettings(hasStoredSettings(storedSettings) ? storedSettings : {}, emptySettings);
  }

  public getSnapshot(): LLMSettings {
    return {
      protocol: this.settings.protocol,
      baseUrl: this.settings.baseUrl,
      model: this.settings.model,
      hasApiKey: Boolean(this.settings.apiKey),
      maskedApiKey: this.settings.apiKey ? maskApiKey(this.settings.apiKey) : undefined,
      settingsPath: this.settingsPath,
      persistedSettings: this.persistedSettings
    };
  }

  public getRuntimeConfig(): ActiveLLMRuntimeConfig {
    return {
      protocol: this.settings.protocol,
      baseUrl: this.settings.baseUrl || undefined,
      model: this.settings.model,
      apiKey: this.settings.apiKey
    };
  }

  public async update(input: {
    protocol: LLMProtocol;
    baseUrl?: string;
    model: string;
    apiKey?: string;
  }): Promise<LLMSettings> {
    const nextSettings = normalizeSettings({
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: input.apiKey
    }, this.settings);

    if (!nextSettings.model) {
      throw new Error("Model is required.");
    }

    this.settings = nextSettings;
    this.writeSettingsFile();
    this.persistedSettings = true;

    return this.getSnapshot();
  }

  private writeSettingsFile(): void {
    mkdirSync(path.dirname(this.settingsPath), {
      recursive: true
    });

    writeFileSync(
      this.settingsPath,
      `${JSON.stringify({
        protocol: this.settings.protocol,
        baseUrl: this.settings.baseUrl,
        model: this.settings.model,
        apiKey: this.settings.apiKey
      }, null, 2)}\n`,
      "utf-8"
    );
  }
}
