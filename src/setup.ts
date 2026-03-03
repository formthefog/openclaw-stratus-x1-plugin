import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Interactive setup command for Stratus plugin
 *
 * @purpose Handles automated configuration of Stratus plugin including OpenClaw config, auth profiles, and environment setup
 */

interface SetupResult {
  success: boolean;
  message: string;
  details?: string[];
}

export async function setupStratus(prompter?: any): Promise<SetupResult> {
  const details: string[] = [];

  try {
    // Step 1: Check for existing API key
    const apiKey = process.env.STRATUS_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        message: "STRATUS_API_KEY not found",
        details: [
          "Please set your Stratus API key as an environment variable:",
          "",
          "  export STRATUS_API_KEY=stratus_sk_your_key_here",
          "",
          "Or add to your shell config (~/.zshrc or ~/.bashrc):",
          "",
          "  echo 'export STRATUS_API_KEY=stratus_sk_your_key_here' >> ~/.zshrc",
          "  source ~/.zshrc",
          "",
          "Get your API key at: https://stratus.run",
        ],
      };
    }

    details.push("✓ Using STRATUS_API_KEY from environment");

    // Paths
    const homeDir = os.homedir();
    const openclawConfig = path.join(homeDir, ".openclaw", "openclaw.json");
    const authProfiles = path.join(
      homeDir,
      ".openclaw",
      "agents",
      "main",
      "agent",
      "auth-profiles.json"
    );

    // Step 2: Update OpenClaw config
    details.push("🔧 Updating OpenClaw configuration...");

    if (fs.existsSync(openclawConfig)) {
      // Backup
      const backupPath = `${openclawConfig}.backup-${Date.now()}`;
      fs.copyFileSync(openclawConfig, backupPath);
      details.push(`  📦 Created backup: ${path.basename(backupPath)}`);

      // Read and update config
      const config = JSON.parse(fs.readFileSync(openclawConfig, "utf-8"));

      // Add models.providers.stratus if not present
      if (!config.models) {
        config.models = {};
      }
      if (!config.models.providers) {
        config.models.providers = {};
      }
      if (!config.models.providers.stratus) {
        config.models.providers.stratus = {
          baseUrl: "https://api.stratus.run/v1",
          api: "openai-completions",
          models: [
            {
              id: "stratus-x1ac-base-claude-sonnet-4-5",
              name: "Stratus X1AC Base (Claude 4.5 Sonnet)",
              reasoning: true,
              input: ["text", "image"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 200000,
              maxTokens: 8192,
            },
          ],
        };
        details.push("  ✓ Added Stratus provider configuration");
      } else {
        details.push("  ✓ Stratus provider already configured");
      }

      // Remove any stratus model alias from agents.defaults.models — having ANY entry
      // there activates openclaw's model allowlist, blocking all non-listed models
      if (config.agents?.defaults?.models?.["stratus/stratus-x1ac-base-claude-sonnet-4-5"]) {
        delete config.agents.defaults.models["stratus/stratus-x1ac-base-claude-sonnet-4-5"];
        details.push("  ✓ Removed restrictive model alias (allows all Stratus models)");
      }

      // Write updated config
      fs.writeFileSync(openclawConfig, JSON.stringify(config, null, 2));
    } else {
      return {
        success: false,
        message: "OpenClaw config not found",
        details: [
          "Run 'openclaw setup' first to initialize OpenClaw",
          "",
          "Need help? Check the docs: https://docs.openclaw.ai",
        ],
      };
    }

    // Step 3: Update auth profiles
    details.push("🔑 Configuring authentication...");

    const authDir = path.dirname(authProfiles);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    let authConfig: any;
    if (fs.existsSync(authProfiles)) {
      // Backup
      const backupPath = `${authProfiles}.backup-${Date.now()}`;
      fs.copyFileSync(authProfiles, backupPath);

      // Update existing
      authConfig = JSON.parse(fs.readFileSync(authProfiles, "utf-8"));
    } else {
      // Create new
      authConfig = {
        version: 1,
        profiles: {},
        lastGood: {},
        usageStats: {},
      };
    }

    // Add Stratus profile
    authConfig.profiles["stratus:default"] = {
      type: "api_key",
      provider: "stratus",
      key: apiKey,
    };
    authConfig.lastGood.stratus = "stratus:default";

    fs.writeFileSync(authProfiles, JSON.stringify(authConfig, null, 2));
    details.push("  ✓ Updated auth profile");

    return {
      success: true,
      message: "Setup complete! 🎉",
      details: [
        ...details,
        "",
        "🎯 Next steps:",
        "  1. Restart gateway: openclaw gateway stop && openclaw gateway install",
        "  2. Verify: openclaw models list | grep stratus",
        "  3. Test: openclaw agent 'Hello Stratus!' --model stratus",
        "",
        "📚 Available tools:",
        "  • stratus_embeddings - Generate semantic embeddings",
        "  • stratus_rollout - Multi-step task planning",
      ],
    };
  } catch (error) {
    return {
      success: false,
      message: "Setup failed",
      details: [
        error instanceof Error ? error.message : String(error),
        "",
        "Need help? Visit: https://stratus.run/docs",
        "Report issues: https://github.com/formthefog/openclaw-stratus-x1-plugin/issues",
      ],
    };
  }
}

function detectShellConfig(): string | null {
  const homeDir = os.homedir();
  const shell = process.env.SHELL || "";

  if (shell.includes("zsh")) {
    return path.join(homeDir, ".zshrc");
  } else if (shell.includes("bash")) {
    if (process.platform === "darwin") {
      return path.join(homeDir, ".bash_profile");
    } else {
      return path.join(homeDir, ".bashrc");
    }
  }

  return null;
}
