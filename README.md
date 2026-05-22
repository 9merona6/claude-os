# Claude OS

Holographic desktop terminal for [Claude Code](https://docs.anthropic.com/claude-code) — a cyberpunk-styled GUI built on Tauri + React, wrapping the official [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

```
┌─────────────┬───────────────────────────────────────┬──────────────┐
│  SESSIONS   │  NEURAL INTERFACE      [OPUS 4.7  ▾]  │  TELEMETRY   │
│             │                                       │              │
│  · dev.ljm  │       ◐  IDLE                         │  Plan quota  │
│  · champ-1  │                                       │  5h  ▓▓░░░░  │
│  · champ-2  │   YOU  prompt                         │  Weekly ░░░  │
│             │   > refactor src/auth.ts              │              │
│   + NEW     │                                       │  Daily 7d    │
│             │   CLAUDE response                     │  ▆▂▃▅▇█▃     │
│  PLAN/TODO  │   ▼ Update (src/auth.ts)              │              │
│  ☑ Read     │     1 - const x = 1                   │  Tools 152x  │
│  ◐ Refactor │     1 + const x = 2                   │              │
│  ☐ Test     │                                       │  Context 0/1M│
└─────────────┴───────────────────────────────────────┴──────────────┘
```

## Disclaimer

**Claude OS is unofficial software.** It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Anthropic, PBC. "Claude" is a trademark of Anthropic; this project uses the name solely to identify the underlying technology it wraps.

Users supply their own Claude Pro / Max / Team subscription via the standard Claude Code CLI login flow. No credentials, API access, or quota are bundled with this app — the wrapper communicates with the locally installed Claude Code CLI on your machine.

## Install (end users)

Tested on Windows 10/11.

1. Install [Node.js 20+](https://nodejs.org)
2. Install Claude Code globally and log in:
   ```sh
   npm install -g @anthropic-ai/claude-code
   claude
   # → /login → opens browser to authenticate with your Claude account
   ```
3. Download the latest `.exe` installer from the [Releases page](https://github.com/lee-jongmyoung/my-claude-terminal/releases/latest) and run it.
4. Launch from Start Menu. Auto-updates apply silently in the background on future releases.

## Features

- **Holographic terminal UI** — cyberpunk theme, neural orb status indicator, ambient scanlines
- **Multi-session tabs** — auto-detected from `~/.claude/projects/` with rename / delete
- **Real-time telemetry**
  - Plan-quota usage (5h window + weekly) from the Claude OAuth `/usage` endpoint
  - 7-day daily token bar chart
  - Tool-call counter per session
  - Live context-window meter (0 / 1M)
- **Rich response rendering**
  - Markdown (headers, bold, italic, lists, tables, blockquotes)
  - Syntax-highlighted code blocks (Prism atom-dark theme)
  - Line-by-line diffs with line numbers for `Edit` calls
  - Collapsible tool-call cards (Write, Edit, Bash, Read, …)
- **Per-session model selection** — Opus / Sonnet / Haiku via the in-app dropdown
- **Auto-update** — silent in-app updater (Tauri updater plugin) signed with Ed25519
- **Native folder picker** for new sessions

## Architecture

```
┌──────────────────────────┐  ws://127.0.0.1:7891  ┌────────────────────┐
│   Tauri shell (Rust)     │  ────────────────────▶│  Sidecar (Node.js) │
│   React frontend (Vite)  │ ◀──────────────────── │  @anthropic-ai/    │
│                          │     events / streams   │  claude-agent-sdk  │
└──────────────────────────┘                        └────────────────────┘
                                                            │
                                                            ▼
                                                   Claude Code CLI
                                                   (local OAuth session)
```

- `src/` — React frontend (Vite, TypeScript)
- `sidecar/` — Node.js WebSocket bridge to the Agent SDK
- `src-tauri/` — Tauri native shell (Rust)

## Development

### Prerequisites
- Node.js 20+
- Rust toolchain ([rustup.rs](https://rustup.rs))
- Windows: Visual Studio Build Tools with "Desktop development with C++"
- Tauri prerequisites: <https://tauri.app/start/prerequisites/>

### Setup

```powershell
git clone https://github.com/lee-jongmyoung/my-claude-terminal.git
cd my-claude-terminal
npm install
cd sidecar && npm install && cd ..

# One-time CLI installer for the project
.\install-cli.ps1
. $PROFILE
```

### CLI commands

After running `install-cli.ps1`, `claude-os` is available from any PowerShell prompt:

| Command | What it does |
|---|---|
| `claude-os dev` | Dev mode — kills stale processes, builds sidecar if missing, runs `tauri dev` |
| `claude-os build` | Local production build (`.exe` + `.msi`) |
| `claude-os release` | Bump patch version → opens Notepad for release notes → commits, tags, pushes |
| `claude-os release minor` | Same but bumps minor version |
| `claude-os release major` | Same but bumps major version |

### Releasing

`claude-os release` triggers `.github/workflows/release.yml` which:
1. Builds Tauri + bundles the Node sidecar as resources
2. Signs the `.exe` + `.msi` with the Ed25519 updater key
3. Publishes a GitHub release with the tag annotation as the changelog
4. Generates `latest.json` for the in-app updater

## License

[MIT](LICENSE) © contributors.

This project uses several third-party packages, each under its own license. Notably:
- Tauri (Apache-2.0 / MIT)
- React (MIT)
- `@anthropic-ai/claude-agent-sdk` (see package's LICENSE)
- `recharts`, `react-markdown`, `react-syntax-highlighter`, `diff` (all MIT)

## Status

Personal hobby project. No support guarantees. Feel free to open issues or fork.
