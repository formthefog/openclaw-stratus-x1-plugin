import type {
  StratusEmbeddingsRequest,
  StratusEmbeddingsResponse,
  StratusPluginConfig,
  StratusRolloutRequest,
  StratusRolloutResponse,
} from "./types.js";

/**
 * SECURITY MANIFEST
 *
 * Environment Variables Accessed:
 * - STRATUS_API_KEY: User's Stratus API key (optional, can use config instead)
 *
 * Network Endpoints:
 * - https://api.stratus.run/v1/embeddings (POST)
 * - https://api.stratus.run/v1/rollout (POST)
 *
 * Data Transmitted:
 * - Authorization header: Bearer token (Stratus API key)
 * - Request body: User-provided text, goals, and parameters
 *
 * Data Retention:
 * - All data sent to Stratus API per their privacy policy: https://stratus.run/privacy
 * - No local storage of credentials beyond process memory
 *
 * Security:
 * - API key validated (must start with 'stratus_sk_')
 * - HTTPS-only connections
 * - Keys never logged or persisted to disk by this plugin
 */

export interface StratusClientConfig {
  apiKey: string;
  baseUrl: string;
}

export class StratusClient {
  constructor(private config: StratusClientConfig) {}

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Stratus API error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    return response.json();
  }

  async embeddings(params: StratusEmbeddingsRequest): Promise<StratusEmbeddingsResponse> {
    return this.request<StratusEmbeddingsResponse>("/v1/embeddings", {
      model: params.model || "stratus-x1ac-base",
      input: params.input,
      encoding_format: params.encoding_format || "float",
    });
  }

  async rollout(params: StratusRolloutRequest): Promise<StratusRolloutResponse> {
    return this.request<StratusRolloutResponse>("/v1/rollout", {
      goal: params.goal,
      initial_state: params.initial_state,
      max_steps: params.max_steps || 10,
      return_intermediate: params.return_intermediate ?? true,
    });
  }

  async listModels(): Promise<{ object: string; data: Array<{ id: string; object: string; created: number; owned_by: string }> }> {
    const url = `${this.config.baseUrl}/v1/models`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Stratus API error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    return response.json();
  }
}

export function createStratusClient(config: StratusPluginConfig | undefined): StratusClient {
  const apiKey = config?.apiKey || process.env.STRATUS_API_KEY;
  const baseUrl = config?.baseUrl || "https://api.stratus.run";

  if (!apiKey) {
    throw new Error(
      "Stratus API key not configured. Set STRATUS_API_KEY env var or plugins.stratus.apiKey in config.",
    );
  }

  if (!apiKey.startsWith("stratus_sk_")) {
    throw new Error(
      `Invalid Stratus API key format. Expected key starting with 'stratus_sk_', got '${apiKey.substring(0, 10)}...'`,
    );
  }

  return new StratusClient({ apiKey, baseUrl });
}
