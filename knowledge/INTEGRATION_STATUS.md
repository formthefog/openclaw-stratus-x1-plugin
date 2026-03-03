# Stratus API Integration Status

Last Updated: 2026-03-03

## Current Status: FULLY OPERATIONAL ✅

### What's Working

1. **API Endpoint**: `https://api.stratus.run/v1` responding correctly
2. **Authentication**: API key (`stratus_sk_*`) validated successfully
3. **Model Provider**: All models served dynamically via `/v1/models`
4. **Chat Completions**: `/v1/chat/completions` working (role mapping resolved server-side)
5. **Embeddings**: `/v1/embeddings` endpoint operational
6. **Rollout**: `/v1/rollout` endpoint operational
7. **Dynamic Model Discovery**: API refreshes model list live from OpenAI, Anthropic, and Google

---

## Role Field Compatibility — RESOLVED ✅

**Previously**: OpenClaw sends `role: "developer"` but Stratus/Anthropic expected `role: "user"` or `role: "assistant"`

**Resolution** (2026-03-03): The Stratus API now accepts the `developer` role natively and normalizes it server-side before forwarding to Anthropic. No plugin-level role mapping required.

API accepts: `system`, `user`, `assistant`, `tool`, `developer`

---

## Model Availability (as of 2026-03-03)

### New Backends Added Since 2026-02-15

**Google Gemini** — now routable:
- `stratus-x1ac-{size}-gemini-2.0-flash` (1M context)
- `stratus-x1ac-{size}-gemini-1.5-pro` (2M context)
- `stratus-x1ac-{size}-gemini-1.5-flash` (1M context)
- `stratus-x1ac-{size}-gemini-pro`

**New Claude models**:
- `stratus-x1ac-{size}-claude-sonnet-4-6` (via OpenRouter)
- `stratus-x1ac-{size}-claude-opus-4-6` (via OpenRouter)
- `stratus-x1ac-{size}-claude-opus-4-1`

### Model Count

The model list is **dynamically discovered** at startup and refreshed hourly. The count of 75 static models is now a floor — live counts will exceed this as Gemini and OpenRouter-discovered models are included.

---

## API Endpoints (Current)

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models (dynamic) |
| `/v1/chat/completions` | POST | Chat completions (OpenAI format) |
| `/v1/messages` | POST | Chat completions (Anthropic Messages format) |
| `/v1/embeddings` | POST | Generate state embeddings |
| `/v1/rollout` | POST | Multi-step action sequence planning |
| `/v1/account/llm-keys` | POST/GET/DELETE | Manage vault-stored LLM keys |
| `/v1/credits/packages` | GET | List credit packages |
| `/v1/credits/purchase/{package}` | POST | Purchase credits |

---

## Authentication Breakthrough (2026-02-15)

### The Discovery

**Problem**: SIGBART was silently falling back to Anthropic despite Stratus being configured in `~/.openclaw/openclaw.json`.

**Root Cause**: OpenClaw maintains TWO separate locations for API authentication:
1. **Config file** (`~/.openclaw/openclaw.json`) - What users edit
2. **Auth cache** (`~/.openclaw/agents/main/agent/auth-profiles.json`) - What the gateway actually uses

**Critical Learning**: The config file does NOT automatically sync to the auth cache.

### Solution Applied

1. Located cached API key in `~/.openclaw/agents/main/agent/auth-profiles.json`
2. Updated auth cache with Stratus credentials
3. Restarted OpenClaw gateway: `openclaw gateway restart`
4. Verified with manual curl - received proper API response

### Verification Commands

```bash
# Check config
cat ~/.openclaw/openclaw.json | grep -A 10 stratus

# Check auth cache (CRITICAL!)
cat ~/.openclaw/agents/main/agent/auth-profiles.json

# Test endpoint directly
curl https://api.stratus.run/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer stratus_sk_..." \
  -d '{
    "model": "stratus-x1ac-base-claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Test"}],
    "max_tokens": 50
  }'
```

---

## Debugging Checklist

When Stratus integration fails:
1. ✅ Verify API key format (`stratus_sk_*`)
2. ✅ Check config file: `~/.openclaw/openclaw.json`
3. ✅ **Check auth cache: `~/.openclaw/agents/main/agent/auth-profiles.json`** (CRITICAL!)
4. ✅ Test with manual curl
5. ✅ Check gateway logs: `openclaw gateway logs`
6. ✅ Restart gateway: `openclaw gateway restart`
7. ✅ Verify endpoint: `https://api.stratus.run/v1`

---

## Success Metrics

- [x] API endpoint reachable
- [x] Authentication working
- [x] Model list dynamically fetched
- [x] Chat completion successful
- [x] Role field compatibility (resolved server-side)
- [x] Embeddings endpoint working
- [x] Rollout endpoint working
- [x] Google Gemini models available
- [x] Claude 4.6 models available

## References

- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) - Detailed debugging guide
- [README.md](../README.md) - Plugin documentation
- Stratus API: https://api.stratus.run
- Stratus Docs: https://stratus.run/docs
