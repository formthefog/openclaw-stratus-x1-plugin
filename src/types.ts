export interface StratusEmbeddingsRequest {
  input: string | string[];
  model?: string;
  encoding_format?: "float" | "base64";
}

export interface StratusEmbeddingsResponse {
  object: "list";
  data: Array<{
    object: "embedding";
    index: number;
    embedding: number[] | string;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface StratusRolloutRequest {
  goal: string;
  initial_state?: string;
  max_steps?: number;
  return_intermediate?: boolean;
}

export interface StratusRolloutStep {
  action?: string;
  description?: string;
  state?: string;
}

export interface StratusRolloutResponse {
  goal: string;
  steps: StratusRolloutStep[];
  success: boolean;
  metadata?: {
    model: string;
    duration_ms?: number;
    brain_confidence?: number;
    brain_goal_proximity?: number;
    key_source?: "user" | "formation";
    formation_markup_applied?: number;
  };
}

export interface StratusInlineKeys {
  openai_key?: string;
  anthropic_key?: string;
  gemini_key?: string;
}

export interface StratusPluginConfig {
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  inlineKeys?: StratusInlineKeys;
  provider?: {
    enabled?: boolean;
    defaultModel?: string;
  };
  tools?: {
    embeddings?: { enabled?: boolean };
    rollout?: { enabled?: boolean };
  };
}
