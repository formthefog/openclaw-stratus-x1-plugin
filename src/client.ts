import type {
  StratusEmbeddingsRequest,
  StratusEmbeddingsResponse,
  StratusInlineKeys,
  StratusPluginConfig,
  StratusRolloutRequest,
  StratusRolloutResponse,
} from "./types.js";

/**
 * SECURITY MANIFEST
 *
 * Environment Variables Accessed:
 * - STRATUS_API_KEY: User's Stratus API key (optional — Formation pool used as fallback)
 * - OPENAI_API_KEY: Optional inline key for BYOK passthrough
 * - ANTHROPIC_API_KEY: Optional inline key for BYOK passthrough
 * - GOOGLE_API_KEY: Optional inline key for BYOK passthrough (also sent as X-Google-Key header)
 *
 * Network Endpoints:
 * - https://api.stratus.run/v1/embeddings (POST)
 * - https://api.stratus.run/v1/rollout (POST)
 * - https://api.stratus.run/v1/models (GET)
 *
 * Data Transmitted:
 * - Authorization header: Bearer token (Stratus API key, when provided)
 * - X-Google-Key header: Google API key (when provided)
 * - Request body: User-provided text, goals, parameters, and optional inline LLM keys
 *
 * Data Retention:
 * - All data sent to Stratus API per their privacy policy: https://stratus.run/privacy
 * - No local storage of credentials beyond process memory
 *
 * Security:
 * - API key validated when present (must start with 'stratus_sk_')
 * - Keyless operation uses Formation pooled keys (25% markup)
 * - HTTPS-only connections
 * - Keys never logged or persisted to disk by this plugin
 */

export interface StratusClientConfig {
  apiKey?: string;
  baseUrl: string;
  inlineKeys?: StratusInlineKeys;
}

export class StratusClient {
  constructor(private config: StratusClientConfig) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    if (this.config.inlineKeys?.gemini_key) {
      headers["X-Google-Key"] = this.config.inlineKeys.gemini_key;
    }

    return headers;
  }

  private buildInlineKeyBody(): Record<string, string> {
    const body: Record<string, string> = {};
    if (this.config.inlineKeys?.openai_key) body.openai_key = this.config.inlineKeys.openai_key;
    if (this.config.inlineKeys?.anthropic_key) body.anthropic_key = this.config.inlineKeys.anthropic_key;
    if (this.config.inlineKeys?.gemini_key) body.gemini_key = this.config.inlineKeys.gemini_key;
    return body;
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const inlineKeys = this.buildInlineKeyBody();
    const mergedBody = { ...(body as Record<string, unknown>), ...inlineKeys };

    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(mergedBody),
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
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
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

  if (apiKey && !apiKey.startsWith("stratus_sk_")) {
    throw new Error(
      `Invalid Stratus API key format. Expected key starting with 'stratus_sk_', got '${apiKey.substring(0, 10)}...'`,
    );
  }

  const inlineKeys: StratusInlineKeys = {
    ...config?.inlineKeys,
    openai_key: config?.inlineKeys?.openai_key || process.env.OPENAI_API_KEY,
    anthropic_key: config?.inlineKeys?.anthropic_key || process.env.ANTHROPIC_API_KEY,
    gemini_key: config?.inlineKeys?.gemini_key || process.env.GOOGLE_API_KEY,
  };

  const hasAnyInlineKey = inlineKeys.openai_key || inlineKeys.anthropic_key || inlineKeys.gemini_key;

  return new StratusClient({
    apiKey: apiKey || undefined,
    baseUrl,
    inlineKeys: hasAnyInlineKey ? inlineKeys : undefined,
  });
}
