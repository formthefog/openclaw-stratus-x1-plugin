import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import type { StratusPluginConfig } from "./src/types.js";
import { createStratusClient } from "./src/client.js";
import { StratusConfigSchema } from "./src/config.js";
import { setupStratus } from "./src/setup.js";

const PROVIDER_ID = "stratus";
const PROVIDER_LABEL = "Stratus";
const DEFAULT_BASE_URL = "https://dev.api.stratus.run/v1";

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

const STRATUS_SIZES = ["small", "base", "large", "xl", "huge"] as const;

const OPENAI_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", context: 128000, tokens: 8192 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", context: 128000, tokens: 8192 },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", context: 128000, tokens: 4096 },
  { id: "gpt-4", name: "GPT-4", context: 8192, tokens: 4096 },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", context: 16385, tokens: 4096 },
] as const;

const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-5", name: "Claude 4.5 Sonnet", context: 200000, tokens: 8192 },
  { id: "claude-opus-4-5", name: "Claude 4.5 Opus", context: 200000, tokens: 8192 },
  { id: "claude-sonnet-4", name: "Claude 4 Sonnet", context: 200000, tokens: 8192 },
  { id: "claude-opus-4", name: "Claude 4 Opus", context: 200000, tokens: 8192 },
  { id: "claude-haiku-4-5", name: "Claude 4.5 Haiku", context: 200000, tokens: 8192 },
  { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", context: 200000, tokens: 8192 },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", context: 200000, tokens: 8192 },
  { id: "claude-3-opus", name: "Claude 3 Opus", context: 200000, tokens: 4096 },
  { id: "claude-3-sonnet", name: "Claude 3 Sonnet", context: 200000, tokens: 4096 },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", context: 200000, tokens: 4096 },
] as const;

function generateAllModels() {
  const models = [];

  for (const size of STRATUS_SIZES) {
    const sizeLabel = size.charAt(0).toUpperCase() + size.slice(1);

    for (const llm of OPENAI_MODELS) {
      models.push(
        buildModelDefinition({
          id: `stratus-x1ac-${size}-${llm.id}`,
          name: `Stratus X1AC ${sizeLabel} (${llm.name})`,
          contextWindow: llm.context,
          maxTokens: llm.tokens,
        }),
      );
    }

    for (const llm of ANTHROPIC_MODELS) {
      models.push(
        buildModelDefinition({
          id: `stratus-x1ac-${size}-${llm.id}`,
          name: `Stratus X1AC ${sizeLabel} (${llm.name})`,
          contextWindow: llm.context,
          maxTokens: llm.tokens,
        }),
      );
    }
  }

  return models;
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
          label: "API Key",
          kind: "api_key",
          run: async (ctx) => {
            const apiKey = await ctx.prompter.text({
              message: "Enter your Stratus API key:",
              validate: (val: string) => {
                if (!val.trim()) {
                  return "API key is required";
                }
                if (!val.startsWith("stratus_sk_")) {
                  return "API key must start with 'stratus_sk_'";
                }
                return undefined;
              },
            });

            const profileId = `${PROVIDER_ID}:default`;

            return {
              profiles: [
                {
                  profileId,
                  credential: {
                    type: "api_key",
                    provider: PROVIDER_ID,
                    key: apiKey,
                  },
                },
              ],
              configPatch: {
                models: {
                  providers: {
                    [PROVIDER_ID]: {
                      baseUrl: DEFAULT_BASE_URL,
                      apiKey: apiKey,
                      api: "openai-completions",
                      models: generateAllModels(),
                    },
                  },
                },
                agents: {
                  defaults: {
                    models: {
                      [`${PROVIDER_ID}/stratus-x1ac-base-claude-sonnet-4-5`]: {
                        alias: "stratus",
                      },
                    },
                  },
                },
              },
              defaultModel: `${PROVIDER_ID}/stratus-x1ac-base-claude-sonnet-4-5`,
              notes: [
                "Stratus provides action-conditioned world modeling for autonomous agents.",
                "Use stratus_embeddings() for semantic state embeddings.",
                "Use stratus_rollout() for multi-step task planning.",
              ],
            };
          },
        },
      ],
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

            return {
              content: [
                {
                  type: "text",
                  text: `${summary}\nGoal: ${response.goal}\n\nSteps:\n${stepText}`,
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
          } else if (subcommand === "verify") {
            // Run verify
            console.log("🔍 Verifying Stratus configuration...\n");

            let errors = 0;

            // Check 1: Environment variable
            console.log("1️⃣  Checking STRATUS_API_KEY...");
            if (process.env.STRATUS_API_KEY) {
              console.log("   ✓ STRATUS_API_KEY is set");
            } else {
              console.log("   ❌ STRATUS_API_KEY not found");
              errors++;
            }

            // Check 2: Config exists
            console.log("\n2️⃣  Checking plugin configuration...");
            if (pluginConfig.apiKey || process.env.STRATUS_API_KEY) {
              console.log("   ✓ API key configured");
            } else {
              console.log("   ❌ API key not configured");
              errors++;
            }

            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            if (errors === 0) {
              console.log("✅ All checks passed!");
              console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
              console.log("🎯 Try it out:");
              console.log("   openclaw agent 'Hello Stratus!' --model stratus\n");
            } else {
              console.log(`❌ ${errors} issue(s) found`);
              console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
              console.log("💡 Run: openclaw stratus setup\n");
              process.exit(1);
            }
            return { text: "" }; // Return empty to avoid double output
          } else {
            // Show help
            return {
              text:
                "🌊 Stratus X1-AC Plugin\n\n" +
                "Commands:\n" +
                "  /stratus setup   - Interactive setup wizard\n" +
                "  /stratus verify  - Verify configuration\n\n" +
                "Get your API key: https://stratus.run\n" +
                "Docs: https://stratus.run/docs",
            };
          }
        },
      });
    }
  },
};

export default stratusPlugin;
