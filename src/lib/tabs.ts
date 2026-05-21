export interface UserTab {
  id: string;
  name: string;
  cwd: string;
  last_session_id: string | null;
  /** preferred Claude model id; null = inherit current default */
  model: string | null;
  created_at: number;
}

const STORAGE_KEY = "claude-terminal-tabs-v1";

export function loadTabs(): UserTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t) =>
          typeof t === "object" &&
          t !== null &&
          typeof t.id === "string" &&
          typeof t.name === "string" &&
          typeof t.cwd === "string",
      )
      .map(
        (t): UserTab => ({
          id: t.id,
          name: t.name,
          cwd: t.cwd,
          last_session_id: typeof t.last_session_id === "string" ? t.last_session_id : null,
          model: typeof t.model === "string" ? t.model : null,
          created_at: typeof t.created_at === "number" ? t.created_at : Date.now(),
        }),
      );
  } catch {
    return [];
  }
}

export function saveTabs(tabs: UserTab[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // ignore quota errors
  }
}

let counter = 0;
export function newTabId(): string {
  counter += 1;
  return `tab_${Date.now()}_${counter}`;
}
