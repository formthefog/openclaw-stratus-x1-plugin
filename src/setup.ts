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

export async function setupStratus(prompter: any): Promise<SetupResult> {
  const details: string[] = [];

  try {
    // Step 1: Check for existing API key
    const existingKey = process.env.STRATUS_API_KEY;

    let apiKey: string;
    if (existingKey) {
      details.push("✓ Using existing STRATUS_API_KEY from environment");
      apiKey = existingKey;
    } else {
      // Prompt for API key
      apiKey = await prompter.text({
        message: "Enter your Stratus API key:",
        placeholder: "stratus_sk_...",
        validate: (val: string) => {
          if (!val.trim()) {
            return "API key is required";
          }
          if (!val.startsWith("stratus_sk_")) {
            return "API key must start with 'stratus_sk_'\nGet your API key at: https://stratus.run";
          }
          return undefined;
        },
      });
    }

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
          baseUrl: "https://dev.api.stratus.run/v1",
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

      // Add model alias
      if (!config.agents?.defaults?.models) {
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        if (!config.agents.defaults.models) config.agents.defaults.models = {};
      }

      if (!config.agents.defaults.models["stratus/stratus-x1ac-base-claude-sonnet-4-5"]) {
        config.agents.defaults.models["stratus/stratus-x1ac-base-claude-sonnet-4-5"] = {
          alias: "stratus",
          params: {},
        };
        details.push("  ✓ Added model alias 'stratus'");
      } else {
        details.push("  ✓ Model alias already configured");
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

    // Step 4: Environment variable setup (optional)
    if (!existingKey) {
      const shellConfig = detectShellConfig();
      if (shellConfig) {
        const addToShell = await prompter.confirm({
          message: `Add STRATUS_API_KEY to ${path.basename(shellConfig)}?`,
          default: true,
        });

        if (addToShell) {
          const envVars = `\n# Stratus X1 configuration for OpenClaw\nexport STRATUS_API_KEY=${apiKey}\nexport STRATUS_BASE_URL=https://dev.api.stratus.run\n`;

          if (fs.existsSync(shellConfig)) {
            const content = fs.readFileSync(shellConfig, "utf-8");
            if (!content.includes("STRATUS_API_KEY")) {
              fs.appendFileSync(shellConfig, envVars);
              details.push(`  ✓ Added to ${path.basename(shellConfig)}`);
              details.push(`  💡 Run: source ${shellConfig}`);
            } else {
              details.push(`  ⚠️  Already present in ${path.basename(shellConfig)}`);
            }
          }
        }
      }
    }

    // Step 5: LaunchAgent plist (macOS only)
    if (process.platform === "darwin") {
      const plistPath = path.join(
        homeDir,
        "Library",
        "LaunchAgents",
        "ai.openclaw.gateway.plist"
      );

      if (fs.existsSync(plistPath)) {
        const addToPlist = await prompter.confirm({
          message: "Add STRATUS_API_KEY to LaunchAgent?",
          default: true,
        });

        if (addToPlist) {
          // This requires plist manipulation - for now, just inform user
          details.push("  💡 To add to LaunchAgent, run:");
          details.push(`     ./install.sh`);
          details.push("     (Uses PlistBuddy to update plist safely)");
        }
      }
    }

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
