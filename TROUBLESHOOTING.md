# Troubleshooting Guide

## Common Issues and Solutions

### Silent Fallback to Anthropic (SIGBART ignores Stratus config)

**Symptoms:**
- SIGBART says "NOW RUNNING: Anthropic (Claude Opus 4.5)"
- Stratus API key configured in `~/.openclaw/openclaw.json`
- No obvious errors in logs
- OpenClaw gateway running normally

**Root Cause:**
OpenClaw maintains **TWO separate locations** for API authentication:

1. **Config file** (`~/.openclaw/openclaw.json`) - What you edit
2. **Auth cache** (`~/.openclaw/agents/main/agent/auth-profiles.json`) - What the gateway actually uses

**The config file does NOT automatically sync to the auth cache.**

**Solution:**

1. Update both files with your Stratus API key:

```bash
# 1. Update config (you probably already did this)
vim ~/.openclaw/openclaw.json

# 2. Update auth cache (THIS IS CRITICAL)
vim ~/.openclaw/agents/main/agent/auth-profiles.json
```

2. In `auth-profiles.json`, add or update the Stratus profile:

```json
{
  "profiles": [
    {
      "provider": "stratus",
      "baseUrl": "https://api.stratus.run/v1",
      "apiKey": "stratus_sk_your_actual_key_here"
    }
  ]
}
```

3. Restart OpenClaw gateway:

```bash
openclaw gateway restart
```

4. Verify auth is working with manual curl:

```bash
curl https://api.stratus.run/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer stratus_sk_your_actual_key_here" \
  -d '{
    "model": "stratus-x1ac-base-claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Test"}],
    "max_tokens": 50
  }'
```

Expected: `200 OK` with a response and credit balance

**Key Learning:**
- Always check **both** config and auth cache files
- Auth cache doesn't auto-sync from config
- 401 Unauthorized = auth cache issue, not endpoint issue
- Use manual curl to verify auth independently

**Verification Success (2026-02-15):**
After fixing the auth cache issue:
- ✅ API endpoint responding: `dev.api.stratus.run`
- ✅ Authentication working: API key validated
- ✅ User balance confirmed: 17784.00 credits
- ✅ Model available: `stratus-x1ac-base-claude-sonnet-4-5`
- ❌ **Next blocker**: Role field compatibility (see section below)

---

### Role Field Compatibility Issue

**Symptoms:**
- OpenClaw sends `role: "developer"` in messages
- Stratus API returns error: `"messages: Unexpected role 'developer'. Allowed roles are 'user' or 'assistant'"`
- May see validation errors about invalid role values

**Root Cause:**
OpenClaw uses Anthropic's `developer` role for system-level instructions, but the Stratus API (which wraps Anthropic's Messages API) expects only `user` or `assistant` roles. The `developer` role is Anthropic-specific but not supported when using the OpenAI-compatible `/v1/chat/completions` endpoint.

**Impact:**
After successfully authenticating and verifying API key/balance, actual chat completion requests fail with role validation errors.

**Current Status (2026-02-15):**
✅ **Authentication working** - API key verified, user balance confirmed (17784.00 credits)
❌ **Chat completions blocked** - Role field validation prevents actual usage
🔧 **Fix needed** - Plugin must transform `developer` → `system` for OpenAI-compatible providers

**Solution Options:**

**Option 1: Patch Stratus Plugin (RECOMMENDED)** ✅
Add role mapping in the OpenClaw Stratus plugin before sending to API:

```typescript
// In src/client.ts
function normalizeRole(role: string): string {
  // Map Anthropic-specific roles to OpenAI-compatible roles
  if (role === 'developer') return 'system';
  return role;
}

// Then in chat completion method:
const normalizedMessages = messages.map(msg => ({
  ...msg,
  role: normalizeRole(msg.role)
}));
```

**Option 2: File OpenClaw Bug**
Request OpenClaw core to handle role mapping for `openai-completions` API format providers automatically.

**Option 3: Use Anthropic Messages API**
Switch from `/v1/chat/completions` (OpenAI format) to `/v1/messages` (native Anthropic format), which natively supports the `developer` role.

**Recommended Path:**
Implement Option 1 (plugin-level role mapping) as it provides maximum compatibility and doesn't depend on upstream changes.

---

### "Stratus API key not configured"

**Cause**: No API key found in config or environment.

**Solution**:

```bash
export STRATUS_API_KEY=stratus_sk_live_your_key_here
```

Or run the setup wizard:

```
/stratus setup
```

---

### "Invalid Stratus API key format"

**Cause**: API key doesn't start with `stratus_sk_`.

**Solution**: Verify your API key from [stratus.run](https://stratus.run).

---

### "Tool not available"

**Cause**: Tool not in allowlist.

**Solution**:

```bash
openclaw config set agents.defaults.tools.allow '["stratus_embeddings", "stratus_rollout"]'
```

---

### "Stratus API error (401)"

**Cause**: Invalid, expired, or cached API key.

**Solution**:

1. Get a new API key from [stratus.run](https://stratus.run)
2. Update BOTH config files:
   - `~/.openclaw/openclaw.json`
   - `~/.openclaw/agents/main/agent/auth-profiles.json`
3. Restart gateway: `openclaw gateway restart`

---

### "Stratus API error (429)"

**Cause**: Rate limit exceeded.

**Solution**: Wait and retry, or upgrade your Stratus plan.

---

## Debugging Checklist

When Stratus integration isn't working:

1. **Verify API key format**: Should start with `stratus_sk_`
2. **Check config file**: `cat ~/.openclaw/openclaw.json | grep stratus`
3. **Check auth cache**: `cat ~/.openclaw/agents/main/agent/auth-profiles.json`
4. **Test with curl**: Use manual curl command (see above)
5. **Check gateway logs**: `openclaw gateway logs`
6. **Restart gateway**: `openclaw gateway restart`
7. **Verify endpoint**: Should be `https://api.stratus.run/v1`

---

## Known Issues

### Auth Cache Staleness

**Issue**: Changes to `openclaw.json` don't automatically sync to `auth-profiles.json`.

**Impact**: Gateway continues using old/invalid credentials even after config update.

**Workaround**: Manually update both files.

**Future Enhancement**: OpenClaw should auto-sync config → auth cache on gateway restart.

---

### Role Field Mapping

**Issue**: OpenClaw uses `developer` role, OpenAI uses `system` role.

**Impact**: May cause validation errors with strict OpenAI-compatible APIs.

**Workaround**: Stratus API now accepts `developer` role (deployed 2026-02-14).

**Future Enhancement**: Plugin should map roles for maximum compatibility.

---

## Getting Help

If none of these solutions work:

1. Check gateway logs: `openclaw gateway logs`
2. File an issue: [GitHub Issues](https://github.com/openclaw/openclaw/issues)
3. Contact Stratus support: support@stratus.run

Include in your report:
- OpenClaw version: `openclaw --version`
- Plugin version: `cat ~/.openclaw/plugins/stratus/package.json | grep version`
- Relevant logs from `openclaw gateway logs`
- Steps to reproduce
