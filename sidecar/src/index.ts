import { WebSocketServer, WebSocket } from "ws";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const PORT = Number(process.env.SIDECAR_PORT) || 7891;
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-7";

// Mutable per-process model selection. Persists across prompts within the
// sidecar's lifetime. New prompts use whatever is currently set.
let currentModel = DEFAULT_MODEL;

// Active Claude Code session context. When the user picks a session from
// the left panel, we set these and pass `cwd` + `resume` to the SDK so
// subsequent prompts continue that conversation.
let activeCwd: string | undefined = undefined;
let activeResumeId: string | undefined = undefined;

type ClientMsg =
  | { type: "prompt"; text: string }
  | { type: "abort" }
  | { type: "refresh_plan_usage" }
  | { type: "set_model"; model: string }
  | { type: "switch_session"; session_id: string; cwd: string }
  | { type: "new_session"; cwd: string; project_name: string }
  | { type: "clear_session" }
  | { type: "delete_claude_session"; session_id: string };

interface PlanWindow {
  utilization: number; // 0-100
  resets_at: string; // ISO timestamp
}

interface PlanUsage {
  five_hour: PlanWindow | null;
  seven_day: PlanWindow | null;
  seven_day_opus: PlanWindow | null;
  seven_day_sonnet: PlanWindow | null;
  subscription_type: string | null;
  rate_limit_tier: string | null;
}

type ServerEvent =
  | { type: "session_start"; sessionId: string }
  | { type: "user_echo"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean }
  | { type: "todos"; todos: Todo[] }
  | { type: "usage"; usage: UsageSnapshot }
  | { type: "result"; cost_usd: number; duration_ms: number; num_turns: number; subtype: string }
  | { type: "error"; message: string }
  | { type: "idle" }
  | { type: "plan_usage"; usage: PlanUsage; fetched_at: number }
  | { type: "plan_usage_error"; message: string }
  | { type: "daily_tokens"; daily: DailyTokens[] }
  | { type: "model"; model: string }
  | { type: "claude_sessions"; sessions: ClaudeSession[] }
  | { type: "session_loading"; session_id: string; cwd: string }
  | { type: "session_loaded"; session_id: string; message_count: number }
  | { type: "host_info"; home_dir: string; platform: string };

interface DailyTokens {
  date: string; // YYYY-MM-DD
  tokens: number;
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

interface ClaudeSession {
  session_id: string;
  cwd: string;
  project_name: string;
  status: "live" | "idle" | "cold";
  pid: number | null;
  last_activity_ms: number;
  message_count: number;
}

interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

interface UsageSnapshot {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
  cost_usd: number;
  timestamp: number;
}

const send = (ws: WebSocket, evt: ServerEvent) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(evt));
  }
};

const cumulativeUsage: UsageSnapshot = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
  timestamp: Date.now(),
};

const resetUsage = () => {
  cumulativeUsage.input_tokens = 0;
  cumulativeUsage.output_tokens = 0;
  cumulativeUsage.cache_creation_input_tokens = 0;
  cumulativeUsage.cache_read_input_tokens = 0;
  cumulativeUsage.total_tokens = 0;
  cumulativeUsage.cost_usd = 0;
  cumulativeUsage.timestamp = Date.now();
};

// Rough cost estimate (Opus 4.7 pricing per 1M tokens — adjust as needed)
const PRICE_INPUT_PER_M = 5.0;
const PRICE_OUTPUT_PER_M = 25.0;
const PRICE_CACHE_WRITE_PER_M = 6.25; // 1.25x input
const PRICE_CACHE_READ_PER_M = 0.5; // 0.1x input

const estimateCost = (u: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): number => {
  const i = u.input_tokens ?? 0;
  const o = u.output_tokens ?? 0;
  const cw = u.cache_creation_input_tokens ?? 0;
  const cr = u.cache_read_input_tokens ?? 0;
  return (
    (i / 1_000_000) * PRICE_INPUT_PER_M +
    (o / 1_000_000) * PRICE_OUTPUT_PER_M +
    (cw / 1_000_000) * PRICE_CACHE_WRITE_PER_M +
    (cr / 1_000_000) * PRICE_CACHE_READ_PER_M
  );
};

async function handlePrompt(ws: WebSocket, prompt: string, abortController: AbortController) {
  send(ws, { type: "user_echo", text: prompt });
  resetUsage();
  send(ws, { type: "usage", usage: { ...cumulativeUsage } });

  try {
    const response = query({
      prompt,
      options: {
        model: currentModel,
        abortController,
        permissionMode: "bypassPermissions", // for desktop app; tighten for production
        ...(activeCwd ? { cwd: activeCwd } : {}),
        ...(activeResumeId ? { resume: activeResumeId } : {}),
      } as Parameters<typeof query>[0]["options"],
    });

    for await (const msg of response as AsyncIterable<SDKMessage>) {
      if (abortController.signal.aborted) break;

      switch (msg.type) {
        case "system": {
          if (msg.subtype === "init") {
            send(ws, { type: "session_start", sessionId: msg.session_id });
          }
          break;
        }

        case "assistant": {
          const content = msg.message.content;
          for (const block of content) {
            if (block.type === "text") {
              send(ws, { type: "assistant_text", text: block.text });
            } else if (block.type === "thinking") {
              send(ws, { type: "thinking", text: block.thinking });
            } else if (block.type === "tool_use") {
              send(ws, {
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input,
              });

              // Detect TodoWrite -> emit plan update
              if (block.name === "TodoWrite") {
                const input = block.input as { todos?: Todo[] };
                if (Array.isArray(input.todos)) {
                  send(ws, { type: "todos", todos: input.todos });
                }
              }
            }
          }

          // Update cumulative usage
          const u = msg.message.usage;
          if (u) {
            cumulativeUsage.input_tokens += u.input_tokens ?? 0;
            cumulativeUsage.output_tokens += u.output_tokens ?? 0;
            cumulativeUsage.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
            cumulativeUsage.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
            cumulativeUsage.total_tokens =
              cumulativeUsage.input_tokens +
              cumulativeUsage.output_tokens +
              cumulativeUsage.cache_creation_input_tokens +
              cumulativeUsage.cache_read_input_tokens;
            cumulativeUsage.cost_usd = estimateCost(cumulativeUsage);
            cumulativeUsage.timestamp = Date.now();
            send(ws, { type: "usage", usage: { ...cumulativeUsage } });
          }
          break;
        }

        case "user": {
          // Tool results
          const content = msg.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block === "object" && block !== null && "type" in block && block.type === "tool_result") {
                const tr = block as {
                  tool_use_id: string;
                  content: string | unknown[];
                  is_error?: boolean;
                };
                const contentStr =
                  typeof tr.content === "string"
                    ? tr.content
                    : JSON.stringify(tr.content);
                send(ws, {
                  type: "tool_result",
                  tool_use_id: tr.tool_use_id,
                  content: contentStr,
                  is_error: tr.is_error ?? false,
                });
              }
            }
          }
          break;
        }

        case "result": {
          send(ws, {
            type: "result",
            cost_usd: msg.total_cost_usd ?? cumulativeUsage.cost_usd,
            duration_ms: msg.duration_ms ?? 0,
            num_turns: msg.num_turns ?? 0,
            subtype: msg.subtype,
          });

          // If SDK provided authoritative cost, use it
          if (msg.total_cost_usd !== undefined && msg.total_cost_usd !== null) {
            cumulativeUsage.cost_usd = msg.total_cost_usd;
            cumulativeUsage.timestamp = Date.now();
            send(ws, { type: "usage", usage: { ...cumulativeUsage } });
          }
          break;
        }
      }
    }

    send(ws, { type: "idle" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sidecar] query error:", message);
    send(ws, { type: "error", message });
    send(ws, { type: "idle" });
  }
}

// =================== Plan usage fetcher ===================
//
// Calls the same endpoint Claude Code uses for `/usage`:
//   GET https://api.anthropic.com/api/oauth/usage
// Auth: Bearer token from ~/.claude/.credentials.json
//
// Response: { five_hour: {utilization, resets_at}, seven_day: {...}, ... }
// Utilization is 0-100, the real number Anthropic tracks for your plan.

interface CredentialsFile {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

async function readCredentials(): Promise<CredentialsFile | null> {
  const credsPath = path.join(os.homedir(), ".claude", ".credentials.json");
  try {
    const raw = await fs.readFile(credsPath, "utf-8");
    return JSON.parse(raw) as CredentialsFile;
  } catch {
    return null;
  }
}

// Cache the last successful plan-usage response so transient errors (429,
// network blips) don't blank out the UI. We keep showing the last known good
// value with a "stale" indicator, and only surface an error if we've never
// had a successful fetch.
let lastPlanUsage: PlanUsage | null = null;
let lastPlanUsageAt = 0;
let nextPlanFetchAfter = 0; // monotonic ms; respects Retry-After / backoff

async function fetchPlanUsage(): Promise<
  { ok: true; usage: PlanUsage } | { ok: false; error: string; retryAfterMs?: number }
> {
  const creds = await readCredentials();
  const oauth = creds?.claudeAiOauth;
  if (!oauth?.accessToken) {
    return { ok: false, error: "no OAuth token (run `claude` to log in)" };
  }
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
    return { ok: false, error: "OAuth token expired — run `claude` once to refresh" };
  }

  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json",
        "User-Agent": "claude-cli/2.1.145",
      },
    });
    if (!res.ok) {
      // Honor Retry-After if present; otherwise back off based on status
      let retryAfterMs: number | undefined;
      const ra = res.headers.get("retry-after");
      if (ra) {
        const seconds = Number(ra);
        if (!Number.isNaN(seconds)) retryAfterMs = seconds * 1000;
      }
      if (retryAfterMs === undefined) {
        retryAfterMs = res.status === 429 ? 5 * 60 * 1000 : 60 * 1000;
      }
      return { ok: false, error: `usage API ${res.status}`, retryAfterMs };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const pick = (k: string): PlanWindow | null => {
      const v = data[k];
      if (
        v &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).utilization === "number" &&
        typeof (v as Record<string, unknown>).resets_at === "string"
      ) {
        return v as unknown as PlanWindow;
      }
      return null;
    };
    return {
      ok: true,
      usage: {
        five_hour: pick("five_hour"),
        seven_day: pick("seven_day"),
        seven_day_opus: pick("seven_day_opus"),
        seven_day_sonnet: pick("seven_day_sonnet"),
        subscription_type: oauth.subscriptionType ?? null,
        rate_limit_tier: oauth.rateLimitTier ?? null,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "fetch failed",
      retryAfterMs: 60 * 1000,
    };
  }
}

async function refreshPlanUsage(ws: WebSocket): Promise<void> {
  // Respect any active backoff window
  if (Date.now() < nextPlanFetchAfter) {
    // Re-emit cached if we have one, so UI stays alive
    if (lastPlanUsage)
      send(ws, { type: "plan_usage", usage: lastPlanUsage, fetched_at: lastPlanUsageAt });
    return;
  }

  const result = await fetchPlanUsage();
  if (result.ok) {
    lastPlanUsage = result.usage;
    lastPlanUsageAt = Date.now();
    nextPlanFetchAfter = 0;
    send(ws, { type: "plan_usage", usage: result.usage, fetched_at: lastPlanUsageAt });
    return;
  }

  // Failure path
  if (result.retryAfterMs && result.retryAfterMs > 0) {
    nextPlanFetchAfter = Date.now() + result.retryAfterMs;
    console.warn(
      `[sidecar] plan usage error: ${result.error} — backing off for ${Math.round(result.retryAfterMs / 1000)}s`,
    );
  }
  // If we have a cached value, keep showing it (don't blank the UI)
  if (lastPlanUsage) {
    send(ws, { type: "plan_usage", usage: lastPlanUsage, fetched_at: lastPlanUsageAt });
  } else {
    send(ws, { type: "plan_usage_error", message: result.error });
  }
}

// =================== Daily token aggregation (last 7 days) ===================
//
// Walks ~/.claude/projects/**/*.jsonl, extracts each assistant message's
// usage tokens, sums by local-date for the last 7 days.

const DAY_MS = 24 * 60 * 60 * 1000;

async function walkJsonl(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkJsonl(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
}

// Local-date YYYY-MM-DD (NOT UTC, to match the user's calendar day)
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchDailyTokens(): Promise<DailyTokens[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime() - 6 * DAY_MS; // start of 7-day window

  const buckets: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() - i * DAY_MS);
    buckets[localDateStr(d)] = 0;
  }

  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const files: string[] = [];
  await walkJsonl(projectsDir, files);

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (stat.mtimeMs < cutoff) continue;

      const content = await fs.readFile(file, "utf-8");
      for (const line of content.split("\n")) {
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as {
            type?: string;
            timestamp?: string;
            message?: {
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                cache_read_input_tokens?: number;
                cache_creation_input_tokens?: number;
              };
            };
          };
          if (obj.type !== "assistant" || !obj.message?.usage || !obj.timestamp) continue;

          const ts = new Date(obj.timestamp);
          if (Number.isNaN(ts.getTime())) continue;
          const dateStr = localDateStr(ts);
          if (!(dateStr in buckets)) continue;

          const u = obj.message.usage;
          const tok =
            (u.input_tokens ?? 0) +
            (u.output_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0);
          buckets[dateStr] += tok;
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // skip unreadable file
    }
  }

  const result: DailyTokens[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const dateStr = localDateStr(d);
    result.push({
      date: dateStr,
      tokens: buckets[dateStr] ?? 0,
      day_of_week: d.getDay(),
    });
  }
  return result;
}

async function refreshDailyTokens(ws: WebSocket): Promise<void> {
  try {
    const daily = await fetchDailyTokens();
    send(ws, { type: "daily_tokens", daily });
  } catch (err) {
    console.error("[sidecar] daily tokens error:", err);
  }
}

// =================== Claude Code session list ===================
//
// Lists all Claude Code sessions:
//   - "live": active session.json file in ~/.claude/sessions/ (recently updated)
//   - "idle": session.json exists but stale, or project has very recent activity
//   - "cold": project has activity in last 7d but no live process
//
// Data sources:
//   ~/.claude/sessions/<pid>.json  — per-process session metadata
//   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl  — conversation logs

interface ActiveSessionFile {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  status?: string;
  updatedAt?: number;
}

const SESSION_LIVE_THRESHOLD_MS = 2 * 60 * 1000; // session updated within 2 min => live
const SESSION_RECENT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7d for "cold" cutoff

async function readActiveSessionFiles(): Promise<Map<string, ActiveSessionFile>> {
  const sessionsDir = path.join(os.homedir(), ".claude", "sessions");
  const map = new Map<string, ActiveSessionFile>();
  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return map;
  }
  for (const f of entries) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(sessionsDir, f), "utf-8");
      const obj = JSON.parse(raw) as ActiveSessionFile;
      if (obj?.sessionId) map.set(obj.sessionId, obj);
    } catch {
      // skip
    }
  }
  return map;
}

// Cap on how many sessions we expose to the UI overall (across all folders).
// Beyond this, older sessions are dropped to keep the list scannable.
const MAX_SESSIONS_TOTAL = 30;
// Skip near-empty .jsonl files (probably aborted sessions, just init events).
const MIN_JSONL_BYTES = 1024;

async function scanClaudeSessions(): Promise<ClaudeSession[]> {
  const active = await readActiveSessionFiles();
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  const now = Date.now();
  const sessions: ClaudeSession[] = [];

  let projectFolders: string[];
  try {
    projectFolders = await fs.readdir(projectsDir);
  } catch {
    return sessions;
  }

  const recentCutoff = now - SESSION_RECENT_THRESHOLD_MS;

  for (const proj of projectFolders) {
    const projPath = path.join(projectsDir, proj);
    try {
      const projStat = await fs.stat(projPath);
      if (!projStat.isDirectory()) continue;
      if (projStat.mtimeMs < recentCutoff) continue;

      const files = await fs.readdir(projPath);
      // Collect ALL real session .jsonl files in this folder (not just the
      // most recent). agent-*.jsonl are subagent traces — skip them.
      const jsonlFiles: { name: string; mtime: number; size: number }[] = [];
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        if (f.startsWith("agent-")) continue;
        try {
          const s = await fs.stat(path.join(projPath, f));
          if (s.mtimeMs < recentCutoff) continue;
          if (s.size < MIN_JSONL_BYTES) continue;
          jsonlFiles.push({ name: f, mtime: s.mtimeMs, size: s.size });
        } catch {
          // skip
        }
      }
      jsonlFiles.sort((a, b) => b.mtime - a.mtime);

      for (const file of jsonlFiles) {
        const sessionId = file.name.replace(/\.jsonl$/, "");
        const filePath = path.join(projPath, file.name);

        let cwd = "";
        let messageCount = 0;
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const lines = content.split("\n");
          for (const line of lines) {
            if (!line) continue;
            if (line.includes('"type":"user"')) messageCount++;
            if (!cwd) {
              try {
                const obj = JSON.parse(line) as { cwd?: string };
                if (obj.cwd) cwd = obj.cwd;
              } catch {
                // skip
              }
            }
          }
        } catch {
          // skip read errors
        }
        if (!cwd) cwd = proj;

        const activeInfo = active.get(sessionId);
        const liveByActiveFile =
          activeInfo &&
          activeInfo.updatedAt !== undefined &&
          now - activeInfo.updatedAt < SESSION_LIVE_THRESHOLD_MS;
        const liveByJsonlMtime = now - file.mtime < SESSION_LIVE_THRESHOLD_MS;
        const status: ClaudeSession["status"] = liveByActiveFile || liveByJsonlMtime
          ? "live"
          : activeInfo
            ? "idle"
            : "cold";

        sessions.push({
          session_id: sessionId,
          cwd,
          project_name: projectNameFromCwd(cwd),
          status,
          pid: activeInfo?.pid ?? null,
          last_activity_ms: file.mtime,
          message_count: messageCount,
        });
      }
    } catch {
      // skip project
    }
  }

  // Sort: live → idle → cold; within each group by recency desc
  const order: Record<ClaudeSession["status"], number> = { live: 0, idle: 1, cold: 2 };
  sessions.sort((a, b) => {
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    return b.last_activity_ms - a.last_activity_ms;
  });

  return sessions.slice(0, MAX_SESSIONS_TOTAL);
}

function projectNameFromCwd(cwd: string): string {
  // Use the last path segment; fall back to whole string
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return cwd;
  const last = parts[parts.length - 1];
  return last;
}

// =================== Session history loader ===================

async function findSessionJsonl(sessionId: string): Promise<string | null> {
  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  let folders: string[];
  try {
    folders = await fs.readdir(projectsDir);
  } catch {
    return null;
  }
  for (const folder of folders) {
    const candidate = path.join(projectsDir, folder, `${sessionId}.jsonl`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not in this folder
    }
  }
  return null;
}

// Trim to the last N user/assistant exchanges so very long sessions don't
// flood the UI. Tool calls/results attached to kept assistant turns are kept.
const MAX_HISTORY_USER_MESSAGES = 100;

async function loadAndEmitHistory(
  ws: WebSocket,
  sessionId: string,
  cwd: string,
): Promise<number> {
  send(ws, { type: "session_loading", session_id: sessionId, cwd });

  const file = await findSessionJsonl(sessionId);
  if (!file) {
    send(ws, {
      type: "error",
      message: `Session ${sessionId.slice(0, 8)}… history not found on disk`,
    });
    send(ws, { type: "session_loaded", session_id: sessionId, message_count: 0 });
    send(ws, { type: "idle" });
    return 0;
  }

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch {
    send(ws, { type: "error", message: "failed to read session history" });
    send(ws, { type: "session_loaded", session_id: sessionId, message_count: 0 });
    send(ws, { type: "idle" });
    return 0;
  }

  const lines = raw.split("\n").filter(Boolean);

  // First pass: count user messages so we know where to start emitting
  let userMsgsTotal = 0;
  for (const line of lines) {
    if (line.includes('"type":"user"')) userMsgsTotal++;
  }
  const startAtUserIdx = Math.max(0, userMsgsTotal - MAX_HISTORY_USER_MESSAGES);

  let userMsgsSeen = 0;
  let emitting = startAtUserIdx === 0;
  let messagesEmitted = 0;
  let latestTodos: unknown = null;

  for (const line of lines) {
    let obj: {
      type?: string;
      timestamp?: string;
      message?: {
        role?: string;
        content?:
          | string
          | Array<{
              type: string;
              text?: string;
              thinking?: string;
              id?: string;
              name?: string;
              input?: unknown;
              tool_use_id?: string;
              content?: unknown;
              is_error?: boolean;
            }>;
      };
    };
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    // Track user-message position to decide when to start emitting
    if (obj.type === "user" && typeof obj.message?.content === "string") {
      userMsgsSeen++;
      if (!emitting && userMsgsSeen > startAtUserIdx) emitting = true;
    }

    if (!emitting) continue;

    if (obj.type === "user" && obj.message) {
      const content = obj.message.content;
      if (typeof content === "string") {
        send(ws, { type: "user_echo", text: content });
        messagesEmitted++;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const c =
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content ?? "");
            send(ws, {
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content: c,
              is_error: block.is_error ?? false,
            });
          }
        }
      }
    } else if (obj.type === "assistant" && Array.isArray(obj.message?.content)) {
      for (const block of obj.message!.content) {
        if (block.type === "text" && block.text) {
          send(ws, { type: "assistant_text", text: block.text });
          messagesEmitted++;
        } else if (block.type === "thinking" && block.thinking) {
          send(ws, { type: "thinking", text: block.thinking });
        } else if (block.type === "tool_use" && block.id && block.name) {
          send(ws, {
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.input,
          });
          if (block.name === "TodoWrite") {
            const input = block.input as { todos?: unknown } | undefined;
            if (input?.todos) latestTodos = input.todos;
          }
        }
      }
    }
  }

  if (latestTodos && Array.isArray(latestTodos)) {
    send(ws, { type: "todos", todos: latestTodos as Todo[] });
  }

  send(ws, { type: "session_loaded", session_id: sessionId, message_count: messagesEmitted });
  // Reset busy state — user_echo events during history replay set busy=true
  send(ws, { type: "idle" });
  return messagesEmitted;
}

async function refreshClaudeSessions(ws: WebSocket): Promise<void> {
  try {
    const sessions = await scanClaudeSessions();
    send(ws, { type: "claude_sessions", sessions });
  } catch (err) {
    console.error("[sidecar] sessions scan error:", err);
  }
}

// =================== WebSocket server ===================

const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });

wss.on("connection", (ws) => {
  console.log("[sidecar] client connected");
  let currentAbort: AbortController | null = null;

  // Tell the client what model is currently selected
  send(ws, { type: "model", model: currentModel });
  // Send host info (home dir + platform) so UI can pre-fill new-tab paths
  send(ws, { type: "host_info", home_dir: os.homedir(), platform: process.platform });

  // Plan usage: poll every 30 min (rate-limited endpoint, shared with Claude Code).
  // Daily tokens + sessions: local file scan, cheap — every 30s.
  refreshPlanUsage(ws);
  refreshDailyTokens(ws);
  refreshClaudeSessions(ws);
  const planInterval = setInterval(() => refreshPlanUsage(ws), 30 * 60 * 1000);
  const dailyInterval = setInterval(() => refreshDailyTokens(ws), 30_000);
  const sessionsInterval = setInterval(() => refreshClaudeSessions(ws), 30_000);

  ws.on("message", async (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg;
    } catch {
      send(ws, { type: "error", message: "invalid JSON" });
      return;
    }

    if (msg.type === "prompt") {
      if (currentAbort) {
        currentAbort.abort();
      }
      currentAbort = new AbortController();
      await handlePrompt(ws, msg.text, currentAbort);
      currentAbort = null;
    } else if (msg.type === "abort") {
      if (currentAbort) {
        currentAbort.abort();
        send(ws, { type: "idle" });
      }
    } else if (msg.type === "refresh_plan_usage") {
      // Manual refresh — reset internal backoff so user can force a re-check.
      // The server may still 429 us; in that case the backoff re-engages.
      nextPlanFetchAfter = 0;
      refreshPlanUsage(ws);
      refreshDailyTokens(ws);
    } else if (msg.type === "set_model") {
      if (typeof msg.model === "string" && msg.model.length > 0) {
        currentModel = msg.model;
        console.log(`[sidecar] model -> ${currentModel}`);
        send(ws, { type: "model", model: currentModel });
      }
    } else if (msg.type === "switch_session") {
      activeCwd = msg.cwd;
      activeResumeId = msg.session_id;
      console.log(`[sidecar] switched session -> ${msg.session_id.slice(0, 8)}… cwd=${msg.cwd}`);
      await loadAndEmitHistory(ws, msg.session_id, msg.cwd);
    } else if (msg.type === "new_session") {
      activeCwd = msg.cwd;
      activeResumeId = undefined; // no resume → SDK starts a fresh session
      console.log(`[sidecar] new session in cwd=${msg.cwd}`);
      send(ws, { type: "session_loaded", session_id: "<new>", message_count: 0 });
    } else if (msg.type === "clear_session") {
      activeCwd = undefined;
      activeResumeId = undefined;
      console.log("[sidecar] cleared active session");
    } else if (msg.type === "delete_claude_session") {
      const file = await findSessionJsonl(msg.session_id);
      if (file) {
        try {
          await fs.unlink(file);
          console.log(`[sidecar] deleted ${file}`);
          // If we were currently resuming that session, clear it
          if (activeResumeId === msg.session_id) {
            activeResumeId = undefined;
          }
          // Re-scan to update the UI immediately
          await refreshClaudeSessions(ws);
        } catch (err) {
          console.error("[sidecar] failed to delete session file:", err);
          send(ws, {
            type: "error",
            message: `Failed to delete session: ${err instanceof Error ? err.message : "unknown"}`,
          });
        }
      } else {
        send(ws, { type: "error", message: "Session file not found" });
      }
    }
  });

  ws.on("close", () => {
    console.log("[sidecar] client disconnected");
    if (currentAbort) currentAbort.abort();
    clearInterval(planInterval);
    clearInterval(dailyInterval);
    clearInterval(sessionsInterval);
  });

  ws.on("error", (err) => {
    console.error("[sidecar] ws error:", err);
  });
});

console.log(`[sidecar] listening on ws://127.0.0.1:${PORT} (model: ${currentModel})`);
