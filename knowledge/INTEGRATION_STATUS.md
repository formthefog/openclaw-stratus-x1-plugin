# Stratus API Integration Status

Last Updated: 2026-02-15

## Current Status: AUTHENTICATION WORKING ✅

### What's Working

1. **API Endpoint**: `dev.api.stratus.run` responding correctly
2. **Authentication**: API key validated successfully
3. **User Balance**: 17784.00 credits confirmed
4. **Model Availability**: `stratus-x1ac-base-claude-sonnet-4-5` ready

### Current Blocker: Role Field Compatibility ⚠️

**Issue**: OpenClaw sends `role: "developer"` but Stratus/Anthropic expects `role: "user"` or `role: "assistant"`

**Error Message**:
```
messages: Unexpected role 'developer'. Allowed roles are 'user' or 'assistant'
```

**Root Cause**: OpenClaw uses Anthropic-specific role field values, but the Stratus API (wrapping Anthropic's Messages API) requires standard OpenAI-compatible role values when using the `/v1/chat/completions` endpoint.

## Authentication Breakthrough (2026-02-15)

### The Discovery

**Problem**: SIGBART was silently falling back to Anthropic despite Stratus being configured in `~/.openclaw/openclaw.json`.

**Root Cause**: OpenClaw maintains TWO separate locations for API authentication:
1. **Config file** (`~/.openclaw/openclaw.json`) - What users edit
2. **Auth cache** (`~/.openclaw/agents/main/agent/auth-profiles.json`) - What the gateway actually uses

**Critical Learning**: The config file does NOT automatically sync to the auth cache.

### Solution Applied

1. Located cached API key in `~/.openclaw/agents/main/agent/auth-profiles.json`
2. Updated auth cache with Stratus credentials:
```json
{
  "profiles": [
    {
      "provider": "stratus",
      "baseUrl": "https://api.stratus.run/v1",
      "apiKey": "stratus_sk_..."
    }
  ]
}
```
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

## Next Steps

### Immediate (High Priority)

1. **Implement role mapping in Stratus plugin** ✅ RECOMMENDED
   - Add `normalizeRole()` function in `src/client.ts`
   - Transform `developer` → `system` before API calls
   - Maintains compatibility with OpenClaw's Anthropic-style messages

2. **Test with simple chat completion**
   - Verify role mapping works
   - Confirm Claude Sonnet 4.5 responds correctly
   - Check credit deduction

### Future Enhancements

1. **File OpenClaw bug report**
   - Document auth cache sync issue
   - Request automatic sync on gateway restart
   - Propose role mapping for `openai-completions` providers

2. **Consider native Anthropic Messages API**
   - Switch from `/v1/chat/completions` to `/v1/messages`
   - Would natively support `developer` role
   - May require more plugin changes

## Lessons Learned

### Auth Cache Staleness

**Problem**: Config changes don't automatically propagate to auth cache
**Impact**: Gateway continues using old/invalid credentials
**Solution**: Always update both files + restart gateway

### Debugging Checklist

When Stratus integration fails:
1. ✅ Verify API key format (`stratus_sk_*`)
2. ✅ Check config file: `~/.openclaw/openclaw.json`
3. ✅ **Check auth cache: `~/.openclaw/agents/main/agent/auth-profiles.json`** (CRITICAL!)
4. ✅ Test with manual curl
5. ✅ Check gateway logs: `openclaw gateway logs`
6. ✅ Restart gateway: `openclaw gateway restart`
7. ✅ Verify endpoint: `https://api.stratus.run/v1`

### Role Field Validation

**Problem**: OpenClaw uses Anthropic-specific role values
**Impact**: OpenAI-compatible APIs reject requests
**Solution**: Plugin-level role mapping for maximum compatibility

## Technical Details

### API Configuration

```json
{
  "provider": "stratus",
  "baseUrl": "https://api.stratus.run/v1",
  "apiKey": "stratus_sk_...",
  "model": "stratus-x1ac-base-claude-sonnet-4-5"
}
```

### Role Mapping Requirements

| OpenClaw Role | Stratus API Expects | Notes |
|---------------|---------------------|-------|
| `developer` | `system` or `user` | Map to `system` for OpenAI format |
| `user` | `user` | Pass through |
| `assistant` | `assistant` | Pass through |

### Error Evolution

1. **Phase 1**: Silent fallback to Anthropic
   - **Cause**: Auth cache not updated
   - **Symptom**: SIGBART uses Anthropic despite config
   - **Fix**: Update auth cache + restart

2. **Phase 2**: 401 Unauthorized (RESOLVED ✅)
   - **Cause**: Invalid/missing API key in auth cache
   - **Symptom**: API returns 401
   - **Fix**: Add valid API key to auth cache

3. **Phase 3**: Role field validation (CURRENT ⚠️)
   - **Cause**: `developer` role not supported in OpenAI format
   - **Symptom**: API returns role validation error
   - **Fix**: Implement role mapping in plugin

## Success Metrics

- [x] API endpoint reachable
- [x] Authentication working
- [x] User balance verified
- [x] Model available
- [ ] Chat completion successful (blocked by role mapping)
- [ ] Credit deduction working
- [ ] Full integration test passing

## References

- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) - Detailed debugging guide
- [README.md](../README.md) - Plugin documentation
- Stratus API: https://api.stratus.run
- Stratus Docs: https://stratus.run/docs
