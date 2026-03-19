# Security Policy

## What This Plugin Does

`@formthefog/stratus` is an OpenClaw plugin that integrates the Stratus X1 world model API. This document provides a transparent accounting of all security-relevant behavior.

---

## Credentials

**What is accessed:**
- `STRATUS_API_KEY` — read from environment or OpenClaw config (`plugins.stratus.apiKey`). **Optional** — if not set, Formation pooled keys are used automatically.
- `OPENAI_API_KEY` — optional, forwarded as inline BYOK key in request body
- `ANTHROPIC_API_KEY` — optional, forwarded as inline BYOK key in request body
- `GOOGLE_API_KEY` — optional, forwarded as inline BYOK key in request body and as `X-Google-Key` header

**What is validated:**
- If `STRATUS_API_KEY` is present, it must match the format `stratus_sk_*` — requests with malformed keys are rejected locally, no network call is made
- If no key is present, the plugin operates in Formation pool mode (zero-config, 25% markup)

**What is written to disk:**
- During setup, the auth profile is stored in `~/.openclaw/agents/main/agent/auth-profiles.json`
- This is the standard OpenClaw credential store, equivalent in scope to `~/.aws/credentials` or `~/.npmrc`
- A timestamped backup of any existing file is created before writing
- Keys are never logged, printed, or written anywhere else by this plugin

**What is never accessed:**
- `~/.ssh` or any SSH keys or known_hosts — nothing in this plugin reads or touches SSH paths
- Other environment variables beyond `STRATUS_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `STRATUS_BASE_URL`, and `SHELL`
- Browser storage, keychains, or system credential managers

---

## Network

**Outbound endpoints:**
| Endpoint | When | What is sent |
|---|---|---|
| `https://api.stratus.run/v1/embeddings` | `stratus_embeddings` tool call | `Authorization: Bearer <key>` (if set), text input, optional inline keys |
| `https://api.stratus.run/v1/rollout` | `stratus_rollout` tool call | `Authorization: Bearer <key>` (if set), goal + state, optional inline keys |
| `https://api.stratus.run/v1/models` | Plugin startup / `/stratus models` | `Authorization: Bearer <key>` (if set) |

**Headers sent:**
- `Authorization: Bearer <key>` — only when `STRATUS_API_KEY` is configured
- `X-Google-Key: <key>` — only when a Google/Gemini key is configured
- `Content-Type: application/json` — on all POST requests

**Inline key fields in request body:**
- `openai_key`, `anthropic_key`, `gemini_key` — only when corresponding environment variables or config values are set

**What is never done:**
- No calls to any endpoint other than `api.stratus.run`
- No telemetry, analytics, or usage reporting
- No data is sent to third parties
- All connections are HTTPS-only

Data handling is governed by the [Stratus privacy policy](https://stratus.run/privacy).

---

## File System

**Files read during setup/verify:**
- `~/.openclaw/openclaw.json` — OpenClaw's own config, to add the Stratus provider entry
- `~/.openclaw/agents/main/agent/auth-profiles.json` — OpenClaw's own auth store, to add Stratus credentials
- `~/Library/LaunchAgents/ai.openclaw.gateway.plist` — macOS only, if the user explicitly opts in during `install.sh`

**Files written during setup:**
- Same paths as above, plus timestamped `.backup-*` copies before any modification

**What is never touched:**
- No files outside `~/.openclaw/` or the LaunchAgent plist
- No `/etc/`, `/usr/`, `/Library/` (system paths)
- No other dotfiles or home directory contents

---

## Reporting a Vulnerability

If you discover a security issue, please report it privately:

- Email: security@stratus.run
- GitHub: [open a private security advisory](https://github.com/formthefog/openclaw-stratus-x1-plugin/security/advisories/new)

Please do not open a public issue for security vulnerabilities. We aim to respond within 72 hours.
