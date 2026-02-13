import type {
  StratusEmbeddingsRequest,
  StratusEmbeddingsResponse,
  StratusPluginConfig,
  StratusRolloutRequest,
  StratusRolloutResponse,
} from "./types.js";

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
    return this.request<StratusEmbeddingsResponse>("/embeddings", {
      model: params.model || "stratus-x1ac-base",
      input: params.input,
      encoding_format: params.encoding_format || "float",
    });
  }

  async rollout(params: StratusRolloutRequest): Promise<StratusRolloutResponse> {
    return this.request<StratusRolloutResponse>("/rollout", {
      goal: params.goal,
      initial_state: params.initial_state,
      max_steps: params.max_steps || 10,
      return_intermediate: params.return_intermediate ?? true,
    });
  }
}

export function createStratusClient(config: StratusPluginConfig | undefined): StratusClient {
  const apiKey = config?.apiKey || process.env.STRATUS_API_KEY;
  const baseUrl = config?.baseUrl || "https://dev.api.stratus.run/v1";

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
