import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk";
import type { StratusPluginConfig } from "./types.js";

export const StratusConfigSchema: OpenClawPluginConfigSchema = {
  parse(value: unknown): StratusPluginConfig {
    const raw =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
    const apiKey = typeof raw.apiKey === "string" ? raw.apiKey : process.env.STRATUS_API_KEY;
    const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "https://dev.api.stratus.run";

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

    return {
      enabled,
      apiKey,
      baseUrl,
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
    apiKey: { label: "API Key", sensitive: true },
    baseUrl: { label: "Base URL", placeholder: "https://dev.api.stratus.run/v1" },
    "provider.enabled": { label: "Provider Enabled" },
    "provider.defaultModel": {
      label: "Default Model",
      placeholder: "stratus-x1ac-base-claude-sonnet-4-5",
    },
    "tools.embeddings.enabled": { label: "Embeddings Tool Enabled" },
    "tools.rollout.enabled": { label: "Rollout Tool Enabled" },
  },
};
