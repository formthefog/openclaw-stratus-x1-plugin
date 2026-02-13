#!/bin/bash

# Stratus OpenClaw Plugin Verification
# Checks that everything is configured correctly

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔍 Stratus Plugin Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ERRORS=0

# Check 1: Environment variable
echo "1️⃣  Checking STRATUS_API_KEY..."
if [[ -n "$STRATUS_API_KEY" ]]; then
    echo "   ✓ STRATUS_API_KEY is set"
else
    echo "   ❌ STRATUS_API_KEY not found in environment"
    ERRORS=$((ERRORS + 1))
fi

# Check 2: OpenClaw config
echo ""
echo "2️⃣  Checking OpenClaw configuration..."
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
if [[ -f "$OPENCLAW_CONFIG" ]]; then
    if jq -e '.models.providers.stratus' "$OPENCLAW_CONFIG" > /dev/null 2>&1; then
        echo "   ✓ Stratus provider configured"
    else
        echo "   ❌ Stratus provider not in config"
        ERRORS=$((ERRORS + 1))
    fi

    if jq -e '.agents.defaults.models["stratus/stratus-x1ac-base-claude-sonnet-4-5"]' "$OPENCLAW_CONFIG" > /dev/null 2>&1; then
        echo "   ✓ Stratus model alias configured"
    else
        echo "   ❌ Stratus model alias not configured"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ❌ OpenClaw config not found"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Auth profile
echo ""
echo "3️⃣  Checking authentication profile..."
AUTH_PROFILES="$HOME/.openclaw/agents/main/agent/auth-profiles.json"
if [[ -f "$AUTH_PROFILES" ]]; then
    if jq -e '.profiles["stratus:default"]' "$AUTH_PROFILES" > /dev/null 2>&1; then
        echo "   ✓ Stratus auth profile exists"
    else
        echo "   ❌ Stratus auth profile not found"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ❌ Auth profiles file not found"
    ERRORS=$((ERRORS + 1))
fi

# Check 4: Plugin loaded
echo ""
echo "4️⃣  Checking plugin status..."
if command -v openclaw > /dev/null 2>&1; then
    if openclaw plugins info stratus 2>&1 | grep -q "Status: loaded"; then
        echo "   ✓ Plugin loaded successfully"
    else
        echo "   ⚠️  Plugin not loaded (restart gateway)"
    fi

    # Check 5: Models available
    echo ""
    echo "5️⃣  Checking model availability..."
    if openclaw models list 2>&1 | grep -q "stratus"; then
        echo "   ✓ Stratus model available"
    else
        echo "   ❌ Stratus model not in model list"
        ERRORS=$((ERRORS + 1))
    fi

    # Check 6: Gateway status
    echo ""
    echo "6️⃣  Checking gateway..."
    if openclaw gateway status 2>&1 | grep -q "RPC probe: ok"; then
        echo "   ✓ Gateway operational"
    else
        echo "   ⚠️  Gateway not responding"
    fi
else
    echo "   ⚠️  OpenClaw CLI not found (install OpenClaw first)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $ERRORS -eq 0 ]]; then
    echo "  ✅ All checks passed!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🎯 Try it out:"
    echo "   openclaw agent 'Hello Stratus!' --model stratus"
    echo ""
    exit 0
else
    echo "  ❌ $ERRORS issue(s) found"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "💡 Try running: ./install.sh"
    echo ""
    exit 1
fi
