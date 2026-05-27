# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Claude OS** — an unofficial Windows desktop terminal for Claude Code. The user runs it instead of the `claude` CLI in a console. It wraps `@anthropic-ai/claude-agent-sdk` and surfaces multi-session tabs, plan-quota telemetry, and rich markdown/diff/tool-card rendering in a cyberpunk Tauri+React UI. **No credentials are bundled** — the app reuses whatever the local `claude` CLI is logged into.

The "unofficial" framing is load-bearing: README and LICENSE call this out explicitly. Don't introduce anything that implies Anthropic affiliation, sponsorship, or endorsement.

## Architecture

Three processes, one app:

```
┌────────────────┐    WebSocket ws://127.0.0.1:7891    ┌──────────────────────┐
│ React + Vite   │ ◀═══════════════════════════════▶ │ Node.js sidecar       │
│ (src/)         │    JSON events / commands         │ (sidecar/src/index.ts)│
│                │                                    │                       │
│  AgentClient   │                                    │  @anthropic-ai/       │
│  (lib/agent-   │                                    │  claude-agent-sdk     │
│   client.ts)   │                                    │  + reads ~/.claude/*  │
└────────────────┘                                    └──────────────────────┘
        ▲                                                          ▲
        │ frontendDist: ../dist                                    │ spawned by
        │                                                          │ Rust (release)
        └─────────────── Tauri shell (src-tauri/src/main.rs) ──────┘
```

**Frontend ↔ sidecar** — single WebSocket. The sidecar is the source of truth for everything except UI state: it owns the active SDK session (`activeCwd` + `activeResumeId` globals), polls plan usage, walks `~/.claude/projects/**/*.jsonl` for the 7-day token chart, and scans `~/.claude/sessions/` for the live-session list. All telemetry is *push*: the sidecar emits `usage`, `plan_usage`, `daily_tokens`, `claude_sessions` events on intervals. `ServerEvent` type unions in `src/lib/types.ts` and `sidecar/src/index.ts` must stay in sync — there's no shared package.

**SDK calls** happen inside `sidecar/src/index.ts::handlePrompt`. It calls `query()` with `permissionMode: "bypassPermissions"` (desktop app trusts the user) and forwards each `SDKMessage` as a typed event. `cwd` + `resume` come from whichever session/tab the UI most recently switched to. Aborting sends `abortController.abort()`.

**Tauri shell** is intentionally thin: `src-tauri/src/main.rs` only registers plugins (dialog/opener/updater/process) and spawns the sidecar in release builds. In `debug_assertions` (i.e., `tauri dev`) it skips spawning — `npm run dev` already started the sidecar via `concurrently`, so spawning again would EADDRINUSE on 7891.

**Bundling**: `tauri.conf.json::bundle.resources` packs `sidecar/dist/index.js` + its production `node_modules` into the installer. At runtime `main.rs` tries several candidate paths (resource_dir, exe-relative, `_up_/` etc., stripping `\\?\` verbatim prefix) before invoking `node` against the bundled script. End-users must have Node.js 20+ on PATH — the binary isn't bundled.

**Auto-updates**: GitHub Releases publishes `latest.json` (signed Ed25519). The Tauri updater plugin polls `https://github.com/9merona6/claude-os/releases/latest/download/latest.json`, downloads NSIS installer, runs it silently. `UpdateBanner.tsx` drives the UI. The private key (`src-tauri/updater.key`) is gitignored — rotating it requires reinstalling on every machine.

### Session model

Two session concepts coexist in the left panel:
- **UserTab** (`src/lib/tabs.ts`) — locally created in the app, named by user, persisted to localStorage. Holds a `last_session_id` pointer that gets rebound each time the SDK emits `session_start`.
- **ClaudeSession** (auto-detected) — discovered by scanning `~/.claude/projects/<encoded>/<sid>.jsonl`. Read-only metadata until "promoted" into a UserTab, which just creates a UserTab keyed to that `session_id`.

Resuming a session: frontend sends `switch_session`, sidecar replays the `.jsonl` (capped at last 100 user turns) as `user_echo` / `assistant_text` / `tool_use` / `tool_result` events, then sets `activeResumeId` so the next `query()` continues that conversation.

## Commands

Dev loop (use this — handles port-7891 cleanup + one-time sidecar build):
```powershell
.\dev.ps1
```

Manual breakdowns:
```powershell
npm run dev               # sidecar (tsx) + vite, no Tauri shell
npm run tauri dev         # full app; assumes sidecar+vite already running
npm run build             # frontend only (tsc + vite build)
cd sidecar; npm run build # compile sidecar TS to dist/
```

Release (bumps `package.json`, `Cargo.toml`, `tauri.conf.json` in lockstep, commits, opens Notepad for release notes, tags, pushes, watches CI):
```powershell
.\release.ps1 patch       # or minor / major
```

No test runner is configured. There is no linter beyond `tsc`.

## Gotchas

- **Three version strings** must move together: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. `release.ps1` does this; don't hand-edit only one.
- **CSP in `tauri.conf.json`** allows `ws://127.0.0.1:7891` — if you change the port, change it here too.
- **`ServerEvent` / `ClientMsg` types are duplicated** between `src/lib/types.ts` and `sidecar/src/index.ts`. Adding a new event means editing both.
- **OAuth token** for the `/usage` endpoint is read from `~/.claude/.credentials.json`. If the user hasn't run `claude` and logged in, plan-quota telemetry will silently degrade to `plan_usage_error`.
- **`permissionMode: "bypassPermissions"`** is set in the sidecar. Tightening it would break the desktop UX (no terminal to approve in) but rethink before exposing this app to untrusted prompts.
- **`agent-*.jsonl` files are subagent traces** — `scanClaudeSessions()` skips them. Don't surface them as sessions.

## Release pipeline reference

`.github/workflows/release.yml` triggers on `v*.*.*` tags. It builds on `windows-latest`, runs `tauri-action@v0` which compiles Rust + signs the NSIS installer + uploads to the GitHub Release. Release notes come from the annotated tag's message (extracted via `git tag -l --format=...`). For end-to-end deployment context, see `RELEASE.md`.
