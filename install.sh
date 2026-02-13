#!/bin/bash
set -e

# Stratus OpenClaw Plugin Installer
# Makes installation feel like butter 🧈

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🌊 Stratus X1 OpenClaw Plugin Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Detect OS
OS=$(uname -s)
SHELL_CONFIG=""

if [[ "$OS" == "Darwin" ]]; then
    # macOS
    if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_CONFIG="$HOME/.zshrc"
    else
        SHELL_CONFIG="$HOME/.bash_profile"
    fi
elif [[ "$OS" == "Linux" ]]; then
    # Linux
    if [[ -n "$ZSH_VERSION" ]] || [[ "$SHELL" == *"zsh"* ]]; then
        SHELL_CONFIG="$HOME/.zshrc"
    else
        SHELL_CONFIG="$HOME/.bashrc"
    fi
fi

# Check for existing API key
EXISTING_KEY="${STRATUS_API_KEY:-}"

if [[ -z "$EXISTING_KEY" ]]; then
    echo "📝 Enter your Stratus API key:"
    echo "   (Get one at: https://stratus.run)"
    echo ""
    read -p "API Key: " API_KEY

    if [[ -z "$API_KEY" ]]; then
        echo "❌ API key is required"
        exit 1
    fi

    if [[ ! "$API_KEY" =~ ^stratus_sk_ ]]; then
        echo "❌ Invalid API key format (must start with 'stratus_sk_')"
        exit 1
    fi
else
    echo "✓ Using existing STRATUS_API_KEY from environment"
    API_KEY="$EXISTING_KEY"
fi

echo ""
echo "🔧 Configuring OpenClaw..."
echo ""

# Paths
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
AUTH_PROFILES="$HOME/.openclaw/agents/main/agent/auth-profiles.json"
LAUNCHD_PLIST="$HOME/Library/LaunchAgents/ai.openclaw.gateway.plist"

# Backup configs
echo "  📦 Creating backups..."
if [[ -f "$OPENCLAW_CONFIG" ]]; then
    cp "$OPENCLAW_CONFIG" "${OPENCLAW_CONFIG}.backup-$(date +%Y%m%d-%H%M%S)"
fi
if [[ -f "$AUTH_PROFILES" ]]; then
    cp "$AUTH_PROFILES" "${AUTH_PROFILES}.backup-$(date +%Y%m%d-%H%M%S)"
fi

# Update OpenClaw config using jq
echo "  🔧 Updating OpenClaw configuration..."

# Add models.providers.stratus if not present
if ! jq -e '.models.providers.stratus' "$OPENCLAW_CONFIG" > /dev/null 2>&1; then
    jq --arg baseUrl "https://dev.api.stratus.run/v1" \
       '.models.providers.stratus = {
          baseUrl: $baseUrl,
          api: "openai-completions",
          models: [
            {
              id: "stratus-x1ac-base-claude-sonnet-4-5",
              name: "Stratus X1AC Base (Claude 4.5 Sonnet)",
              reasoning: true,
              input: ["text", "image"],
              cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
              contextWindow: 200000,
              maxTokens: 8192
            }
          ]
        }' "$OPENCLAW_CONFIG" > "${OPENCLAW_CONFIG}.tmp" && mv "${OPENCLAW_CONFIG}.tmp" "$OPENCLAW_CONFIG"
    echo "    ✓ Added Stratus provider configuration"
else
    echo "    ✓ Stratus provider already configured"
fi

# Add model alias to agents.defaults.models if not present
if ! jq -e '.agents.defaults.models["stratus/stratus-x1ac-base-claude-sonnet-4-5"]' "$OPENCLAW_CONFIG" > /dev/null 2>&1; then
    jq '.agents.defaults.models["stratus/stratus-x1ac-base-claude-sonnet-4-5"] = {
          alias: "stratus",
          params: {}
        }' "$OPENCLAW_CONFIG" > "${OPENCLAW_CONFIG}.tmp" && mv "${OPENCLAW_CONFIG}.tmp" "$OPENCLAW_CONFIG"
    echo "    ✓ Added model alias 'stratus'"
else
    echo "    ✓ Model alias already configured"
fi

# Update auth profiles
echo "  🔑 Configuring authentication..."
mkdir -p "$(dirname "$AUTH_PROFILES")"

if [[ ! -f "$AUTH_PROFILES" ]]; then
    # Create new auth profiles file
    cat > "$AUTH_PROFILES" << EOF
{
  "version": 1,
  "profiles": {
    "stratus:default": {
      "type": "api_key",
      "provider": "stratus",
      "key": "$API_KEY"
    }
  },
  "lastGood": {
    "stratus": "stratus:default"
  },
  "usageStats": {}
}
EOF
    echo "    ✓ Created auth profile"
else
    # Update existing auth profiles
    jq --arg key "$API_KEY" \
       '.profiles["stratus:default"] = {
          type: "api_key",
          provider: "stratus",
          key: $key
        } |
        .lastGood.stratus = "stratus:default"' "$AUTH_PROFILES" > "${AUTH_PROFILES}.tmp" && mv "${AUTH_PROFILES}.tmp" "$AUTH_PROFILES"
    echo "    ✓ Updated auth profile"
fi

# Update shell config (optional)
if [[ -n "$SHELL_CONFIG" ]] && [[ "$EXISTING_KEY" != "$API_KEY" ]]; then
    echo ""
    read -p "  Add STRATUS_API_KEY to $SHELL_CONFIG? (y/N): " ADD_TO_SHELL
    if [[ "$ADD_TO_SHELL" =~ ^[Yy]$ ]]; then
        if ! grep -q "STRATUS_API_KEY" "$SHELL_CONFIG"; then
            cat >> "$SHELL_CONFIG" << EOF

# Stratus X1 configuration for OpenClaw
export STRATUS_API_KEY=$API_KEY
export STRATUS_BASE_URL=https://dev.api.stratus.run
EOF
            echo "    ✓ Added to $SHELL_CONFIG"
            echo "    💡 Run: source $SHELL_CONFIG"
        else
            echo "    ⚠️  Already present in $SHELL_CONFIG"
        fi
    fi
fi

# Update LaunchAgent plist (macOS only)
if [[ "$OS" == "Darwin" ]] && [[ -f "$LAUNCHD_PLIST" ]]; then
    echo ""
    read -p "  Add STRATUS_API_KEY to LaunchAgent? (y/N): " ADD_TO_PLIST
    if [[ "$ADD_TO_PLIST" =~ ^[Yy]$ ]]; then
        if ! grep -q "STRATUS_API_KEY" "$LAUNCHD_PLIST"; then
            # Backup plist
            cp "$LAUNCHD_PLIST" "${LAUNCHD_PLIST}.backup-$(date +%Y%m%d-%H%M%S)"

            # Add environment variables to plist
            /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:STRATUS_API_KEY string $API_KEY" "$LAUNCHD_PLIST" 2>/dev/null || \
            /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:STRATUS_API_KEY $API_KEY" "$LAUNCHD_PLIST"

            /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:STRATUS_BASE_URL string https://dev.api.stratus.run" "$LAUNCHD_PLIST" 2>/dev/null || \
            /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:STRATUS_BASE_URL https://dev.api.stratus.run" "$LAUNCHD_PLIST"

            echo "    ✓ Updated LaunchAgent plist"
            echo "    💡 Restart gateway: openclaw gateway stop && openclaw gateway install"
        else
            echo "    ⚠️  Already present in LaunchAgent"
        fi
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Installation Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Next steps:"
echo ""
echo "  1. Restart OpenClaw gateway:"
echo "     openclaw gateway stop && openclaw gateway install"
echo ""
echo "  2. Verify installation:"
echo "     openclaw models list | grep stratus"
echo "     openclaw plugins info stratus"
echo ""
echo "  3. Test the Stratus model:"
echo "     openclaw agent 'Hello from Stratus!' --model stratus"
echo ""
echo "📚 Available tools:"
echo "  • stratus_embeddings - Generate semantic embeddings"
echo "  • stratus_rollout - Multi-step task planning"
echo ""
echo "🌊 Enjoy Stratus X1!"
echo ""
