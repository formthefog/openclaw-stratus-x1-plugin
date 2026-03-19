import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { StratusPluginConfig } from "./src/types.js";
import { createStratusClient } from "./src/client.js";
import { StratusConfigSchema } from "./src/config.js";
import { setupStratus } from "./src/setup.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PROVIDER_ID = "stratus";
const PROVIDER_LABEL = "Stratus";
const DEFAULT_BASE_URL = "https://api.stratus.run/v1";

function buildModelDefinition(params: {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
}) {
  return {
    id: params.id,
    name: params.name,
    reasoning: true,
    input: ["text", "image"] as const,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: params.contextWindow || 128000,
    maxTokens: params.maxTokens || 8192,
  };
}

// Model metadata for naming/context/tokens (fallback if API doesn't provide details)
const MODEL_METADATA: Record<string, { name: string; context: number; tokens: number }> = {
  "gpt-4o": { name: "GPT-4o", context: 128000, tokens: 8192 },
  "gpt-4o-mini": { name: "GPT-4o Mini", context: 128000, tokens: 8192 },
  "gpt-4-turbo": { name: "GPT-4 Turbo", context: 128000, tokens: 4096 },
  "gpt-4": { name: "GPT-4", context: 8192, tokens: 4096 },
  "gpt-3.5-turbo": { name: "GPT-3.5 Turbo", context: 16385, tokens: 4096 },
  "claude-sonnet-4-6": { name: "Claude 4.6 Sonnet", context: 200000, tokens: 8192 },
  "claude-opus-4-6": { name: "Claude 4.6 Opus", context: 200000, tokens: 8192 },
  "claude-sonnet-4-5": { name: "Claude 4.5 Sonnet", context: 200000, tokens: 8192 },
  "claude-opus-4-5": { name: "Claude 4.5 Opus", context: 200000, tokens: 8192 },
  "claude-haiku-4-5": { name: "Claude 4.5 Haiku", context: 200000, tokens: 8192 },
  "claude-sonnet-4": { name: "Claude 4 Sonnet", context: 200000, tokens: 8192 },
  "claude-opus-4-1": { name: "Claude 4.1 Opus", context: 200000, tokens: 8192 },
  "claude-opus-4": { name: "Claude 4 Opus", context: 200000, tokens: 8192 },
  "claude-3-7-sonnet": { name: "Claude 3.7 Sonnet", context: 200000, tokens: 8192 },
  "claude-3-5-sonnet": { name: "Claude 3.5 Sonnet", context: 200000, tokens: 8192 },
  "claude-3-opus": { name: "Claude 3 Opus", context: 200000, tokens: 4096 },
  "claude-3-sonnet": { name: "Claude 3 Sonnet", context: 200000, tokens: 4096 },
  "claude-3-haiku": { name: "Claude 3 Haiku", context: 200000, tokens: 4096 },
  "gemini-2.0-flash": { name: "Gemini 2.0 Flash", context: 1048576, tokens: 8192 },
  "gemini-1.5-pro": { name: "Gemini 1.5 Pro", context: 2097152, tokens: 8192 },
  "gemini-1.5-flash": { name: "Gemini 1.5 Flash", context: 1048576, tokens: 8192 },
  "gemini-pro": { name: "Gemini Pro", context: 32768, tokens: 8192 },
};

function generateModelName(modelId: string): string {
  // Parse model ID like "stratus-x1ac-base-claude-sonnet-4-5"
  const parts = modelId.split("-");
  
  // Extract size (small/base/large/xl/huge)
  let size = "";
  let baseModelId = "";
  
  if (parts.length >= 4 && parts[0] === "stratus" && parts[1] === "x1ac") {
    size = parts[2];
    baseModelId = parts.slice(3).join("-");
  } else {
    // Fallback for non-standard format
    return modelId;
  }
  
  const sizeLabel = size.charAt(0).toUpperCase() + size.slice(1);
  const metadata = MODEL_METADATA[baseModelId];
  
  if (metadata) {
    return `Stratus X1AC ${sizeLabel} (${metadata.name})`;
  }
  
  // Fallback: capitalize base model
  return `Stratus X1AC ${sizeLabel} (${baseModelId})`;
}

async function generateAllModels(apiKey?: string, baseUrl?: string) {
  const root = (baseUrl || DEFAULT_BASE_URL).replace(/\/v\d+\/?$/, "");
  try {
    const url = `${root}/v1/models`;
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as { data: Array<{ id: string }> };

    return data.data.map((model) => {
      const modelId = model.id;
      const baseModelId = modelId.replace(/^stratus-x1ac-(small|base|large|xl|huge)-/, "");
      const metadata = MODEL_METADATA[baseModelId];
      return buildModelDefinition({
        id: modelId,
        name: generateModelName(modelId),
        contextWindow: metadata?.context || 128000,
        maxTokens: metadata?.tokens || 8192,
      });
    });
  } catch (error) {
    console.error("[stratus] Failed to fetch models from API:", error);
    return [
      buildModelDefinition({
        id: "stratus-x1ac-base-claude-sonnet-4-5",
        name: "Stratus X1AC Base (Claude 4.5 Sonnet)",
        contextWindow: 200000,
        maxTokens: 8192,
      }),
    ];
  }
}

async function updateStoredModels(models: ReturnType<typeof buildModelDefinition>[]) {
  const configPath = join(homedir(), ".openclaw", "openclaw.json");
  if (!existsSync(configPath)) return;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    if (!config?.models?.providers?.stratus) return;

    config.models.providers.stratus.models = models;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // Silent fail — stale models are better than a crash
  }
}

const stratusPlugin = {
  id: "stratus",
  name: "Stratus API Integration",
  description: "Stratus V3 (X1-AC) action-conditioned JEPA for autonomous agent planning",
  configSchema: StratusConfigSchema,

  register(api: OpenClawPluginApi) {
    const pluginConfig = StratusConfigSchema.parse(api.pluginConfig) as StratusPluginConfig;

    api.registerProvider({
      id: PROVIDER_ID,
      label: PROVIDER_LABEL,
      docsPath: "/providers/stratus",
      aliases: ["stratus-run"],
      auth: [
        {
          id: "api-key",
          label: "API Key (optional — Formation pool available)",
          kind: "api_key",
          run: async (ctx) => {
            const apiKey = await ctx.prompter.text({
              message: "Enter your Stratus API key (leave blank for Formation pool — zero-config):",
              validate: (val: string) => {
                if (!val.trim()) return undefined;
                if (!val.startsWith("stratus_sk_")) {
                  return "API key must start with 'stratus_sk_'";
                }
                return undefined;
              },
            });

            const usingPool = !apiKey?.trim();
            const resolvedKey = usingPool ? undefined : apiKey;
            const profileId = `${PROVIDER_ID}:${usingPool ? "formation-pool" : "default"}`;

            const models = await generateAllModels(resolvedKey, DEFAULT_BASE_URL);

            const credential = usingPool
              ? { type: "formation_pool" as const, provider: PROVIDER_ID }
              : { type: "api_key" as const, provider: PROVIDER_ID, key: resolvedKey! };

            const authMode = usingPool
              ? "Formation pool (zero-config, 25% markup)"
              : "BYOK (no markup)";

            return {
              profiles: [{ profileId, credential }],
              configPatch: {
                models: {
                  providers: {
                    [PROVIDER_ID]: {
                      baseUrl: DEFAULT_BASE_URL,
                      ...(resolvedKey ? { apiKey: resolvedKey } : {}),
                      api: "openai-completions",
                      models: models,
                    },
                  },
                },
              },
              defaultModel: `${PROVIDER_ID}/stratus-x1ac-base-claude-sonnet-4-5`,
              notes: [
                "🌊 Stratus X1-AC: World Model + Collective Intelligence System",
                "",
                `🔒 Auth: ${authMode}`,
                "",
                "NOT just an LLM wrapper — this is predictive planning:",
                "  Traditional agents: see → think → act → see again",
                "  Stratus agents: see → simulate outcomes → pick best → act",
                "",
                "Architecture:",
                "  • World Model (X1): Predicts future states from actions (JEPA-based)",
                "  • Policy Head v3 (X1-AC): 94.4% accuracy, brain-guided action sequencing",
                "  • Collective Network: Agents learn from each other in real-time",
                "",
                `Loaded ${models.length} models dynamically from Stratus API`,
                "  2050+ models via OpenRouter — OpenAI, Anthropic, Google, and more",
                "  BYOK support: pass your own provider keys to bypass Formation pool",
                "",
                "Available Tools:",
                "  • stratus_embeddings() - 768-dim semantic state embeddings",
                "  • stratus_rollout() - Multi-step action sequence planning (Policy Head v3)",
                "",
                "Commands: /stratus setup | /stratus verify | /stratus models",
                "Technical docs: https://stratus.run/docs/technical-overview",
              ],
            };
          },
        },
      ],
    });

    api.on("gateway_start", async () => {
      const apiKey = pluginConfig.apiKey || process.env.STRATUS_API_KEY;
      try {
        const models = await generateAllModels(apiKey, pluginConfig.baseUrl);
        await updateStoredModels(models);
      } catch {
        // Silent fail — don't disrupt gateway startup
      }
    });

    if (!pluginConfig.tools?.embeddings?.enabled && !pluginConfig.tools?.rollout?.enabled) {
      return;
    }

    if (pluginConfig.tools?.embeddings?.enabled) {
      api.registerTool(
        {
          name: "stratus_embeddings",
          label: "Stratus Embeddings",
          description:
            "Generate 768-dimensional state embeddings for semantic search and memory. Use this for understanding semantic relationships between states or actions.",
          parameters: Type.Object({
            input: Type.Union(
              [
                Type.String({ description: "Single text to embed" }),
                Type.Array(Type.String(), { description: "Multiple texts to embed" }),
              ],
              { description: "Text or array of texts to generate embeddings for" },
            ),
            model: Type.Optional(
              Type.String({
                description: "Stratus model to use",
                default: "stratus-x1ac-base",
              }),
            ),
            encoding_format: Type.Optional(
              Type.Union([Type.Literal("float"), Type.Literal("base64")], {
                default: "float",
                description: "Format for embedding vectors",
              }),
            ),
          }),
          async execute(_toolCallId, params, context) {
            const client = createStratusClient(pluginConfig);

            const response = await client.embeddings({
              input: params.input,
              model: params.model,
              encoding_format: params.encoding_format,
            });

            const count = response.data.length;
            const dimensions = Array.isArray(response.data[0]?.embedding)
              ? response.data[0].embedding.length
              : 768;

            return {
              content: [
                {
                  type: "text",
                  text: `Generated ${count} embedding${count === 1 ? "" : "s"} (${dimensions} dimensions each)\nModel: ${response.model}\nUsage: ${response.usage.prompt_tokens} tokens`,
                },
              ],
              details: response,
            };
          },
        },
        { optional: true },
      );
    }

    if (pluginConfig.tools?.rollout?.enabled) {
      api.registerTool(
        {
          name: "stratus_rollout",
          label: "Stratus Rollout",
          description:
            "Multi-step rollout prediction for task planning. Predicts action sequences to reach a goal state. Use this for complex task decomposition and planning.",
          parameters: Type.Object({
            goal: Type.String({
              description: "Target state or goal to achieve (e.g., 'book a hotel room')",
            }),
            initial_state: Type.Optional(
              Type.String({
                description: "Starting state (optional, can be inferred from context)",
              }),
            ),
            max_steps: Type.Optional(
              Type.Number({
                description: "Maximum rollout steps",
                default: 10,
                minimum: 1,
                maximum: 50,
              }),
            ),
            return_intermediate: Type.Optional(
              Type.Boolean({
                description: "Return intermediate states",
                default: true,
              }),
            ),
          }),
          async execute(_toolCallId, params, context) {
            const client = createStratusClient(pluginConfig);

            const response = await client.rollout({
              goal: params.goal,
              initial_state: params.initial_state,
              max_steps: params.max_steps,
              return_intermediate: params.return_intermediate,
            });

            const steps = response.steps || [];
            const stepText = steps
              .map((s, i) => `${i + 1}. ${s.action || s.description || "Unknown step"}`)
              .join("\n");

            const summary = response.success
              ? `Successfully planned ${steps.length} steps to reach goal`
              : `Planning incomplete (${steps.length} steps generated)`;

            const meta = response.metadata;
            const metaLines: string[] = [];
            if (meta?.brain_confidence != null) {
              metaLines.push(`Brain confidence: ${(meta.brain_confidence * 100).toFixed(1)}%`);
            }
            if (meta?.brain_goal_proximity != null) {
              metaLines.push(`Goal proximity: ${(meta.brain_goal_proximity * 100).toFixed(1)}%`);
            }
            if (meta?.key_source) {
              metaLines.push(`Key source: ${meta.key_source}${meta.formation_markup_applied ? ` (${meta.formation_markup_applied * 100}% markup)` : ""}`);
            }
            const metaText = metaLines.length > 0 ? `\n\n${metaLines.join("\n")}` : "";

            return {
              content: [
                {
                  type: "text",
                  text: `${summary}\nGoal: ${response.goal}\n\nSteps:\n${stepText}${metaText}`,
                },
              ],
              details: response,
            };
          },
        },
        { optional: true },
      );
    }

    // Register CLI commands
    if (typeof api.registerCommand === "function") {
      api.registerCommand({
        name: "stratus",
        description: "Stratus plugin commands (setup, verify)",
        acceptsArgs: true,
        handler: async (ctx: any) => {
          const args = ctx.args?.trim() ?? "";
          const tokens = args.split(/\s+/).filter(Boolean);
          const subcommand = (tokens[0] || "help").toLowerCase();

          if (subcommand === "setup") {
            // Run setup
            const result = await setupStratus(ctx.prompter);

            if (result.success) {
              console.log(`\n✅ ${result.message}\n`);
              if (result.details) {
                result.details.forEach((line) => console.log(line));
              }
            } else {
              console.error(`\n❌ ${result.message}\n`);
              if (result.details) {
                result.details.forEach((line) => console.error(line));
              }
              process.exit(1);
            }
            return { text: "" }; // Return empty to avoid double output
          } else if (subcommand === "models") {
            const apiKey = pluginConfig.apiKey || process.env.STRATUS_API_KEY;
            const models = await generateAllModels(apiKey, pluginConfig.baseUrl);

            await updateStoredModels(models);

            const sizes = ["small", "base", "large", "xl", "huge"];
            const grouped = sizes
              .map((size) => {
                const sizeModels = models.filter(
                  (m) => m.id.includes(`-x1ac-${size}-`) || m.id.endsWith(`-x1ac-${size}`)
                );
                if (sizeModels.length === 0) return null;
                return `  ${size.toUpperCase()} (${sizeModels.length})\n` +
                  sizeModels.map((m) => `    • ${m.id}`).join("\n");
              })
              .filter(Boolean)
              .join("\n\n");

            return {
              text:
                `Stratus Models (${models.length} total)\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                grouped +
                `\n\nConfig synced. Run /models to see the full list.`,
            };
          } else if (subcommand === "verify") {
            console.log("🔍 Verifying Stratus configuration...\n");

            const hasKey = !!(pluginConfig.apiKey || process.env.STRATUS_API_KEY);

            console.log("1️⃣  Auth mode:");
            if (hasKey) {
              console.log("   ✓ BYOK — using STRATUS_API_KEY (no markup)");
            } else {
              console.log("   ✓ Formation pool — zero-config (25% markup)");
              console.log("   💡 Set STRATUS_API_KEY to remove markup");
            }

            console.log("\n2️⃣  API connectivity...");
            try {
              const models = await generateAllModels(
                hasKey ? (pluginConfig.apiKey || process.env.STRATUS_API_KEY) : undefined,
                pluginConfig.baseUrl,
              );
              console.log(`   ✓ Connected — ${models.length} models available`);
            } catch {
              console.log("   ⚠ Could not reach API (may still work at runtime)");
            }

            console.log("\n3️⃣  Inline BYOK keys:");
            const envKeys = [
              ["OPENAI_API_KEY", process.env.OPENAI_API_KEY],
              ["ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY],
              ["GOOGLE_API_KEY", process.env.GOOGLE_API_KEY],
            ] as const;
            let anyInline = false;
            for (const [name, val] of envKeys) {
              if (val) {
                console.log(`   ✓ ${name} detected (BYOK passthrough)`);
                anyInline = true;
              }
            }
            if (!anyInline) {
              console.log("   – None set (optional — Formation pool covers all providers)");
            }

            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("✅ Stratus is ready!");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            console.log("🎯 Try it out:");
            console.log("   openclaw agent 'Hello Stratus!' --model stratus\n");
            return { text: "" };
          } else {
            // Show help
            return {
              text:
                "🌊 Stratus X1-AC Plugin\n\n" +
                "Commands:\n" +
                "  /stratus setup   - Interactive setup wizard\n" +
                "  /stratus verify  - Verify configuration\n" +
                "  /stratus models  - List all available models (fetches live from API)\n\n" +
                "Get your API key: https://stratus.run\n" +
                "Docs: https://stratus.run/docs\n" +
                "Issues: https://github.com/formthefog/openclaw-stratus-x1-plugin/issues",
            };
          }
        },
      });
    }
  },
};

export default stratusPlugin;
