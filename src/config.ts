import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk";
import type { StratusPluginConfig } from "./types.js";

export const StratusConfigSchema: OpenClawPluginConfigSchema = {
  parse(value: unknown): StratusPluginConfig {
    const entry =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const enabled = typeof entry.enabled === "boolean" ? entry.enabled : true;

    const raw =
      entry.config && typeof entry.config === "object" && !Array.isArray(entry.config)
        ? (entry.config as Record<string, unknown>)
        : {};

    const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : process.env.STRATUS_API_KEY;
    const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "https://api.stratus.run";

    const provider =
      raw.provider && typeof raw.provider === "object" && !Array.isArray(raw.provider)
        ? (raw.provider as Record<string, unknown>)
        : {};

    const providerEnabled = typeof provider.enabled === "boolean" ? provider.enabled : true;
    const defaultModel =
      typeof provider.defaultModel === "string"
        ? provider.defaultModel
        : "stratus-x1ac-base-claude-sonnet-4-5";

    const tools =
      raw.tools && typeof raw.tools === "object" && !Array.isArray(raw.tools)
        ? (raw.tools as Record<string, unknown>)
        : {};

    const embeddings =
      tools.embeddings && typeof tools.embeddings === "object"
        ? (tools.embeddings as Record<string, unknown>)
        : {};
    const rollout =
      tools.rollout && typeof tools.rollout === "object"
        ? (tools.rollout as Record<string, unknown>)
        : {};

    const inlineKeysRaw =
      raw.inlineKeys && typeof raw.inlineKeys === "object" && !Array.isArray(raw.inlineKeys)
        ? (raw.inlineKeys as Record<string, unknown>)
        : {};

    const inlineKeys = {
      openai_key: typeof inlineKeysRaw.openai_key === "string" ? inlineKeysRaw.openai_key : undefined,
      anthropic_key: typeof inlineKeysRaw.anthropic_key === "string" ? inlineKeysRaw.anthropic_key : undefined,
      gemini_key: typeof inlineKeysRaw.gemini_key === "string" ? inlineKeysRaw.gemini_key : undefined,
    };

    return {
      enabled,
      apiKey,
      baseUrl,
      inlineKeys,
      provider: {
        enabled: providerEnabled,
        defaultModel,
      },
      tools: {
        embeddings: {
          enabled: typeof embeddings.enabled === "boolean" ? embeddings.enabled : true,
        },
        rollout: {
          enabled: typeof rollout.enabled === "boolean" ? rollout.enabled : true,
        },
      },
    };
  },
  uiHints: {
    enabled: { label: "Enabled" },
    "config.apiKey": { label: "API Key", sensitive: true },
    "config.baseUrl": { label: "Base URL", placeholder: "https://api.stratus.run" },
    "config.inlineKeys.openai_key": { label: "OpenAI Key (BYOK)", sensitive: true },
    "config.inlineKeys.anthropic_key": { label: "Anthropic Key (BYOK)", sensitive: true },
    "config.inlineKeys.gemini_key": { label: "Google Gemini Key (BYOK)", sensitive: true },
    "config.provider.enabled": { label: "Provider Enabled" },
    "config.provider.defaultModel": {
      label: "Default Model",
      placeholder: "stratus-x1ac-base-claude-sonnet-4-5",
    },
    "config.tools.embeddings.enabled": { label: "Embeddings Tool Enabled" },
    "config.tools.rollout.enabled": { label: "Rollout Tool Enabled" },
  },
};
