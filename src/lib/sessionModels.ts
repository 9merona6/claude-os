// Per-session model preferences for auto-detected Claude Code sessions.
// (User tabs store their own model in UserTab.model.)

export type SessionModels = Record<string, string>;

const KEY = "claude-terminal-session-models-v1";

export function loadSessionModels(): SessionModels {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: SessionModels = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveSessionModels(map: SessionModels): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}
