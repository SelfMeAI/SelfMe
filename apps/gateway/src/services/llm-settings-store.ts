import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

import type { LLMProtocol, LLMSettings } from "@selfme/protocol";

interface StoredProfile {
  id: string;
  name?: string;
  protocol?: string;
  baseUrl?: string;
  model?: string;
}

interface StoredConfigFile {
  activeProfileId?: string;
  profiles?: StoredProfile[];
}

interface StoredSecretsFile {
  profileSecrets?: Record<string, { apiKey?: string }>;
}

interface LegacyModelConfig {
  llmModel?: string;
}

interface RuntimeProfile {
  id: string;
  name: string;
  protocol: LLMProtocol;
  baseUrl: string;
  model: string;
}

export interface ActiveLLMRuntimeConfig {
  profileId: string;
  profileName: string;
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

function normalizeProfile(
  input: {
    id?: string;
    name?: string;
    protocol?: string;
    baseUrl?: string;
    model?: string;
  },
  fallback: RuntimeProfile
): RuntimeProfile {
  return {
    id: input.id?.trim() || fallback.id,
    name: input.name?.trim() || fallback.name,
    protocol: normalizeProtocol(input.protocol, fallback.protocol),
    baseUrl: input.baseUrl?.trim() ?? fallback.baseUrl,
    model: input.model?.trim() || fallback.model
  };
}

function loadLegacyModel(filePath: string): string {
  const legacy = readJsonFile<LegacyModelConfig>(filePath);
  return legacy?.llmModel?.trim() ?? "";
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
  private readonly configPath: string;
  private readonly secretsPath: string;
  private readonly fallbackApiKey: string;
  private readonly profiles = new Map<string, RuntimeProfile>();
  private readonly secrets = new Map<string, string>();
  private activeProfileId: string;
  private persistedConfig: boolean;
  private persistedSecrets: boolean;

  public constructor(input: {
    configPath: string;
    secretsPath: string;
    legacyModelConfigPath: string;
    defaultProfile: {
      id: string;
      name: string;
      protocol: LLMProtocol;
      baseUrl?: string;
      model: string;
      apiKey: string;
    };
  }) {
    this.configPath = input.configPath;
    this.secretsPath = input.secretsPath;
    this.fallbackApiKey = input.defaultProfile.apiKey;

    const defaultProfile: RuntimeProfile = {
      id: input.defaultProfile.id,
      name: input.defaultProfile.name,
      protocol: input.defaultProfile.protocol,
      baseUrl: input.defaultProfile.baseUrl?.trim() ?? "",
      model: loadLegacyModel(input.legacyModelConfigPath) || input.defaultProfile.model
    };

    const storedConfig = readJsonFile<StoredConfigFile>(input.configPath);
    const storedSecrets = readJsonFile<StoredSecretsFile>(input.secretsPath);

    this.persistedConfig = existsSync(input.configPath);
    this.persistedSecrets = existsSync(input.secretsPath);

    const normalizedProfiles = (storedConfig?.profiles ?? [])
      .filter((profile) => typeof profile?.id === "string" && profile.id.trim().length > 0)
      .map((profile) => normalizeProfile(profile, defaultProfile));

    if (normalizedProfiles.length === 0) {
      normalizedProfiles.push(defaultProfile);
    }

    for (const profile of normalizedProfiles) {
      this.profiles.set(profile.id, profile);
    }

    this.activeProfileId = storedConfig?.activeProfileId && this.profiles.has(storedConfig.activeProfileId)
      ? storedConfig.activeProfileId
      : normalizedProfiles[0]?.id ?? defaultProfile.id;

    const storedProfileSecrets = storedSecrets?.profileSecrets ?? {};
    for (const [profileId, secretRecord] of Object.entries(storedProfileSecrets)) {
      const apiKey = secretRecord?.apiKey?.trim();
      if (apiKey) {
        this.secrets.set(profileId, apiKey);
      }
    }
  }

  public getSnapshot(): LLMSettings {
    const activeProfile = this.getActiveProfile();
    const activeApiKey = this.secrets.get(activeProfile.id) || this.fallbackApiKey;

    return {
      activeProfileId: activeProfile.id,
      profileName: activeProfile.name,
      protocol: activeProfile.protocol,
      baseUrl: activeProfile.baseUrl,
      model: activeProfile.model,
      hasApiKey: Boolean(activeApiKey),
      maskedApiKey: activeApiKey ? maskApiKey(activeApiKey) : undefined,
      configPath: this.configPath,
      secretsPath: this.secretsPath,
      persistedConfig: this.persistedConfig,
      persistedSecrets: this.persistedSecrets
    };
  }

  public getRuntimeConfig(): ActiveLLMRuntimeConfig {
    const activeProfile = this.getActiveProfile();

    return {
      profileId: activeProfile.id,
      profileName: activeProfile.name,
      protocol: activeProfile.protocol,
      baseUrl: activeProfile.baseUrl || undefined,
      model: activeProfile.model,
      apiKey: this.secrets.get(activeProfile.id) || this.fallbackApiKey
    };
  }

  public async updateActiveProfile(input: {
    profileName?: string;
    protocol: LLMProtocol;
    baseUrl?: string;
    model: string;
    apiKey?: string;
  }): Promise<LLMSettings> {
    const currentProfile = this.getActiveProfile();
    const nextProfile: RuntimeProfile = {
      ...currentProfile,
      name: input.profileName?.trim() || currentProfile.name,
      protocol: normalizeProtocol(input.protocol, currentProfile.protocol),
      baseUrl: input.baseUrl?.trim() ?? "",
      model: input.model.trim()
    };

    if (!nextProfile.model) {
      throw new Error("Model is required.");
    }

    this.profiles.set(nextProfile.id, nextProfile);

    const normalizedApiKey = input.apiKey?.trim();
    if (normalizedApiKey) {
      this.secrets.set(nextProfile.id, normalizedApiKey);
    }

    await this.persistConfigFile();
    if (normalizedApiKey) {
      await this.persistSecretsFile();
    }

    return this.getSnapshot();
  }

  private getActiveProfile(): RuntimeProfile {
    const profile = this.profiles.get(this.activeProfileId);

    if (!profile) {
      throw new Error("The active profile does not exist.");
    }

    return profile;
  }

  private async persistConfigFile(): Promise<void> {
    await mkdir(path.dirname(this.configPath), {
      recursive: true
    });

    const payload = {
      activeProfileId: this.activeProfileId,
      profiles: Array.from(this.profiles.values()).map((profile) => ({
        id: profile.id,
        name: profile.name,
        protocol: profile.protocol,
        baseUrl: profile.baseUrl,
        model: profile.model
      }))
    };

    await writeFile(this.configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    this.persistedConfig = true;
  }

  private async persistSecretsFile(): Promise<void> {
    await mkdir(path.dirname(this.secretsPath), {
      recursive: true
    });

    const profileSecrets = Object.fromEntries(
      Array.from(this.secrets.entries()).map(([profileId, apiKey]) => [profileId, { apiKey }])
    );

    await writeFile(
      this.secretsPath,
      `${JSON.stringify({ profileSecrets }, null, 2)}\n`,
      "utf-8"
    );
    this.persistedSecrets = true;
  }
}
