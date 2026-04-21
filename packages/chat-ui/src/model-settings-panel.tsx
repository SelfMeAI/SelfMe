"use client";

import { useEffect, useState } from "react";

import type { UpdateLLMSettingsInput } from "@selfme/protocol";

interface ModelSettingsPanelProps {
  settings: import("./types").LLMSettingsState | null;
  saving: boolean;
  onSave: (input: UpdateLLMSettingsInput) => Promise<void>;
}

export function ModelSettingsPanel({
  settings,
  saving,
  onSave
}: ModelSettingsPanelProps) {
  const [draftProtocol, setDraftProtocol] = useState<UpdateLLMSettingsInput["protocol"]>(settings?.protocol ?? "openai");
  const [draftBaseUrl, setDraftBaseUrl] = useState(settings?.baseUrl ?? "");
  const [draftModel, setDraftModel] = useState(settings?.model ?? "");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDraftProtocol(settings?.protocol ?? "openai");
    setDraftBaseUrl(settings?.baseUrl ?? "");
    setDraftModel(settings?.model ?? "");
    setDraftApiKey("");
  }, [settings?.protocol, settings?.baseUrl, settings?.model]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedModel = draftModel.trim();

    if (!normalizedModel) {
      setError("Model is required.");
      setNotice("");
      return;
    }

    try {
      setError("");
      setNotice("");
      await onSave({
        protocol: draftProtocol,
        baseUrl: draftBaseUrl.trim(),
        model: normalizedModel,
        apiKey: draftApiKey.trim()
      });
      setNotice("Saved. New requests will use the updated model settings.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save settings.");
      setNotice("");
    }
  }

  const currentModel = settings?.model ?? "";
  const canSave = !saving && (
    draftModel.trim() !== currentModel
    || draftProtocol !== (settings?.protocol ?? "openai")
    || draftBaseUrl.trim() !== (settings?.baseUrl ?? "")
    || draftApiKey.trim().length > 0
  ) && draftModel.trim().length > 0;

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <div className="settings-panel-kicker">Model settings</div>
        <h1 className="settings-panel-title">Provider, endpoint, and credentials.</h1>
        <p className="settings-panel-copy">Only the active runtime settings live here. API keys are kept in the local secrets file and only a masked summary is shown after save.</p>
      </div>

      <div className="settings-summary">
        <div className="settings-summary-item">
          <span className="settings-summary-label">Current</span>
          <span className="settings-summary-value">{currentModel || "Loading"}</span>
        </div>
        <div className="settings-summary-item">
          <span className="settings-summary-label">Protocol</span>
          <span className="settings-summary-value">{settings?.protocol ?? "Loading"}</span>
        </div>
        <div className="settings-summary-item">
          <span className="settings-summary-label">API key</span>
          <span className="settings-summary-value">{settings?.maskedApiKey || "Not set"}</span>
        </div>
      </div>

      <form className="settings-form" onSubmit={handleSubmit}>
        <label className="settings-field">
          <span className="settings-field-label">Protocol</span>
          <select
            className="settings-field-input"
            value={draftProtocol}
            onChange={(event) => {
              setDraftProtocol(event.target.value as UpdateLLMSettingsInput["protocol"]);
              if (error) {
                setError("");
              }
              if (notice) {
                setNotice("");
              }
            }}
          >
            <option value="openai">openai</option>
            <option value="anthropic">anthropic</option>
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">Base URL</span>
          <input
            className="settings-field-input"
            value={draftBaseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(event) => {
              setDraftBaseUrl(event.target.value);
              if (error) {
                setError("");
              }
              if (notice) {
                setNotice("");
              }
            }}
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">Model</span>
          <input
            className="settings-field-input"
            value={draftModel}
            placeholder="gpt-4.1-mini"
            onChange={(event) => {
              setDraftModel(event.target.value);
              if (error) {
                setError("");
              }
              if (notice) {
                setNotice("");
              }
            }}
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">API key</span>
          <input
            className="settings-field-input"
            value={draftApiKey}
            type="password"
            placeholder={settings?.hasApiKey ? "Enter a new key to replace the stored one" : "Enter API key"}
            onChange={(event) => {
              setDraftApiKey(event.target.value);
              if (error) {
                setError("");
              }
              if (notice) {
                setNotice("");
              }
            }}
          />
          <span className="settings-field-hint">
            {settings?.hasApiKey
              ? `${settings?.maskedApiKey || "A key"} is already stored locally. Leave this blank to keep it unchanged.`
              : "No key is stored yet. Add one here to enable authenticated requests."}
          </span>
        </label>

        <div className="settings-storage-grid">
          <div className="settings-storage-card">
            <span className="settings-field-label">Config file</span>
            <div className="settings-storage-path">{settings?.configPath || "Loading config path..."}</div>
          </div>
          <div className="settings-storage-card">
            <span className="settings-field-label">Secrets file</span>
            <div className="settings-storage-path">{settings?.secretsPath || "Loading secrets path..."}</div>
          </div>
        </div>

        {error ? <div className="settings-feedback settings-feedback-error">{error}</div> : null}
        {notice ? <div className="settings-feedback settings-feedback-success">{notice}</div> : null}

        <div className="settings-actions">
          <button type="submit" className="settings-save-button" disabled={!canSave}>
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
