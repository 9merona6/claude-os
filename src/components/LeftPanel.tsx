import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ClaudeSession, Todo, UsageSnapshot } from "../lib/types";
import type { UserTab } from "../lib/tabs";

interface Props {
  connected: boolean;
  busy: boolean;
  msgCount: number;
  usage: UsageSnapshot;
  todos: Todo[];
  tabs: UserTab[];
  activeTabId: string | null;
  activeClaudeSessionId: string | null;
  claudeSessions: ClaudeSession[];
  homeDir: string;
  onSelectTab: (tab: UserTab) => void;
  onSelectClaudeSession: (s: ClaudeSession) => void;
  onCreateTab: (name: string, cwd: string) => void;
  onDeleteTab: (tabId: string) => void;
  onRenameTab: (tabId: string, newName: string) => void;
  onDeleteClaudeSession: (sessionId: string) => void;
  onPromoteToTab: (s: ClaudeSession, newName: string) => void;
}

const STATUS_GLYPH: Record<Todo["status"], string> = {
  pending: "▢",
  in_progress: "▶",
  completed: "✓",
};

function LeftPanelImpl({
  connected,
  busy,
  msgCount,
  usage,
  todos,
  tabs,
  activeTabId,
  activeClaudeSessionId,
  claudeSessions,
  homeDir,
  onSelectTab,
  onSelectClaudeSession,
  onCreateTab,
  onDeleteTab,
  onRenameTab,
  onDeleteClaudeSession,
  onPromoteToTab,
}: Props) {
  const completed = todos.filter((t) => t.status === "completed").length;

  // Suggested paths derived from existing Claude Code projects on disk.
  const suggestedPaths = useMemo(() => {
    const seen = new Set<string>();
    const result: { name: string; cwd: string }[] = [];
    for (const s of claudeSessions) {
      if (!seen.has(s.cwd)) {
        seen.add(s.cwd);
        result.push({ name: s.project_name, cwd: s.cwd });
      }
    }
    return result.slice(0, 10);
  }, [claudeSessions]);

  // Map last_session_id → live ClaudeSession (so we can show LIVE/IDLE status on tabs)
  const sessionById = useMemo(() => {
    const m = new Map<string, ClaudeSession>();
    for (const s of claudeSessions) m.set(s.session_id, s);
    return m;
  }, [claudeSessions]);

  // Auto-detected Claude Code sessions that AREN'T already linked to a user tab.
  // (If a tab points to a session_id, hide that session from the "Claude Code" list
  // to avoid duplication.)
  const tabSessionIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of tabs) if (t.last_session_id) s.add(t.last_session_id);
    return s;
  }, [tabs]);
  // For each project folder, keep the session with the most messages. Ties
  // broken by recency. Why messages-first: a stray `claude` CLI invocation in
  // the same folder creates a new tiny session_id that would otherwise hide
  // the substantive conversation behind a 1-msg card, which looks like data
  // loss to the user (the big history is still on disk, just not surfaced).
  const standaloneSessions = useMemo(() => {
    const byFolder = new Map<string, ClaudeSession>();
    for (const s of claudeSessions) {
      if (tabSessionIds.has(s.session_id)) continue;
      const existing = byFolder.get(s.cwd);
      if (
        !existing ||
        s.message_count > existing.message_count ||
        (s.message_count === existing.message_count &&
          s.last_activity_ms > existing.last_activity_ms)
      ) {
        byFolder.set(s.cwd, s);
      }
    }
    const order: Record<ClaudeSession["status"], number> = { live: 0, idle: 1, cold: 2 };
    return Array.from(byFolder.values())
      .sort((a, b) => {
        const d = order[a.status] - order[b.status];
        if (d !== 0) return d;
        return b.last_activity_ms - a.last_activity_ms;
      })
      .slice(0, 20);
  }, [claudeSessions, tabSessionIds]);

  const [creating, setCreating] = useState(false);
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [renameAutoSessionId, setRenameAutoSessionId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Two-step inline delete confirmation. Holds the id (tab id or session id)
  // that's "armed" for deletion. Auto-clears after 4s.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDeleteId) return;
    const t = setTimeout(() => setPendingDeleteId(null), 4000);
    return () => clearTimeout(t);
  }, [pendingDeleteId]);

  // Close form when clicking outside
  useEffect(() => {
    if (!creating) return;
    const onDoc = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [creating]);

  return (
    <aside className="panel left-panel">
      <div className="panel-corner-tr" />
      <div className="panel-corner-bl" />
      <div className="panel-header">
        <span>◈ Sessions</span>
        <div className="dot" />
      </div>
      <div className="panel-body">
        {tabs.length === 0 && standaloneSessions.length === 0 && !creating && (
          <div className="todos-empty" style={{ marginBottom: 12 }}>
            no sessions yet — create one below
          </div>
        )}

        {tabs.map((tab) => (
          <TabCard
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            busy={busy}
            liveStatus={tab.last_session_id ? sessionById.get(tab.last_session_id)?.status ?? null : null}
            msgCount={
              activeTabId === tab.id
                ? msgCount
                : tab.last_session_id
                  ? sessionById.get(tab.last_session_id)?.message_count ?? 0
                  : 0
            }
            currentTokens={activeTabId === tab.id ? usage.total_tokens : 0}
            isRenaming={renameTabId === tab.id}
            armedForDelete={pendingDeleteId === tab.id}
            onSelect={() => onSelectTab(tab)}
            onArmDelete={() => setPendingDeleteId(tab.id)}
            onConfirmDelete={() => {
              setPendingDeleteId(null);
              onDeleteTab(tab.id);
            }}
            onStartRename={() => setRenameTabId(tab.id)}
            onCommitRename={(newName) => {
              if (newName && newName !== tab.name) onRenameTab(tab.id, newName);
              setRenameTabId(null);
            }}
          />
        ))}

        {standaloneSessions.length > 0 &&
          standaloneSessions.map((s) => {
              const isActive = activeClaudeSessionId === s.session_id;
              const cursorStyle = busy && !isActive ? "not-allowed" : "pointer";
              return (
                <div
                  key={s.session_id}
                  className={`session-card${isActive ? " active" : ""}`}
                  onClick={() => {
                    if (busy && !isActive) return;
                    onSelectClaudeSession(s);
                  }}
                  title={s.cwd}
                  style={{ cursor: cursorStyle, opacity: busy && !isActive ? 0.5 : 1 }}
                >
                  <div className="session-row">
                    {renameAutoSessionId === s.session_id ? (
                      <RenameInput
                        initial={s.project_name}
                        onCommit={(newName) => {
                          setRenameAutoSessionId(null);
                          if (newName && newName !== s.project_name) {
                            onPromoteToTab(s, newName);
                          }
                        }}
                      />
                    ) : (
                      <div
                        className="session-name"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenameAutoSessionId(s.session_id);
                        }}
                        title="double-click to rename"
                      >
                        {s.project_name}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="session-status">
                        <div className={`status-dot ${s.status}`} />
                        {s.status.toUpperCase()}
                      </div>
                      <DeleteButton
                        armed={pendingDeleteId === s.session_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pendingDeleteId === s.session_id) {
                            setPendingDeleteId(null);
                            onDeleteClaudeSession(s.session_id);
                          } else {
                            setPendingDeleteId(s.session_id);
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="session-meta">
                    <span>{s.message_count} msg</span>
                    <span style={{ color: "var(--text-faint)" }}>
                      {formatAgo(Date.now() - s.last_activity_ms)}
                    </span>
                  </div>
                  <div className="session-meta">
                    <span
                      style={{
                        color: "var(--text-faint)",
                        fontSize: 9,
                        letterSpacing: "0.02em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                        display: "block",
                      }}
                    >
                      {shortenPath(s.cwd)}
                    </span>
                  </div>
                </div>
              );
            })}

        {!creating ? (
          <button
            className="new-session-btn"
            onClick={() => setCreating(true)}
            disabled={busy || !connected}
            style={{ marginTop: 8 }}
          >
            + NEW TAB
          </button>
        ) : (
          <NewTabForm
            forwardRef={formRef}
            suggestions={suggestedPaths}
            defaultCwd={homeDir}
            onCancel={() => setCreating(false)}
            onCreate={(name, cwd) => {
              onCreateTab(name, cwd);
              setCreating(false);
            }}
          />
        )}

        <div className="section-title">
          Plan / TODO
          {todos.length > 0 && (
            <span className="pill">
              {completed}/{todos.length}
            </span>
          )}
        </div>
        {todos.length === 0 ? (
          <div className="todos-empty">no plan yet</div>
        ) : (
          <ol className="todos">
            {todos.map((t, i) => (
              <li key={i} className={`todo ${t.status}`}>
                <span className="glyph">{STATUS_GLYPH[t.status]}</span>
                <span className="content">
                  {t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

// =================== Tab card ===================

interface TabCardProps {
  tab: UserTab;
  isActive: boolean;
  busy: boolean;
  liveStatus: ClaudeSession["status"] | null;
  msgCount: number;
  currentTokens: number;
  isRenaming: boolean;
  armedForDelete: boolean;
  onSelect: () => void;
  onArmDelete: () => void;
  onConfirmDelete: () => void;
  onStartRename: () => void;
  onCommitRename: (newName: string) => void;
}

function TabCard({
  tab,
  isActive,
  busy,
  liveStatus,
  msgCount,
  currentTokens,
  isRenaming,
  armedForDelete,
  onSelect,
  onArmDelete,
  onConfirmDelete,
  onStartRename,
  onCommitRename,
}: TabCardProps) {
  const cursorStyle = busy && !isActive ? "not-allowed" : "pointer";
  const dotClass = isActive
    ? busy
      ? "live"
      : "idle"
    : liveStatus ?? "cold";

  return (
    <div
      className={`session-card${isActive ? " active" : ""}`}
      onClick={() => {
        if (busy && !isActive) return;
        if (isRenaming) return;
        onSelect();
      }}
      title={tab.cwd}
      style={{ cursor: cursorStyle, opacity: busy && !isActive ? 0.5 : 1 }}
    >
      <div className="session-row">
        {isRenaming ? (
          <RenameInput initial={tab.name} onCommit={onCommitRename} />
        ) : (
          <div
            className="session-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            {tab.name}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className={`status-dot ${dotClass}`} />
          <DeleteButton
            armed={armedForDelete}
            onClick={(e) => {
              e.stopPropagation();
              if (armedForDelete) onConfirmDelete();
              else onArmDelete();
            }}
          />
        </div>
      </div>
      <div className="session-meta">
        <span>
          {isActive ? msgCount : msgCount} msg
          {isActive && ` · ${Math.round(currentTokens / 1000)}K ctx`}
        </span>
        <span style={{ color: "var(--text-faint)", fontSize: 9 }}>
          {tab.last_session_id ? "↻ resume" : "✦ fresh"}
        </span>
      </div>
      <div className="session-meta">
        <span
          style={{
            color: "var(--text-faint)",
            fontSize: 9,
            letterSpacing: "0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
            display: "block",
          }}
        >
          {shortenPath(tab.cwd)}
        </span>
      </div>
    </div>
  );
}

// =================== Delete button (2-step) ===================

interface DeleteButtonProps {
  armed: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function DeleteButton({ armed, onClick }: DeleteButtonProps) {
  return (
    <button
      className={`tab-delete-btn${armed ? " armed" : ""}`}
      onClick={onClick}
      title={armed ? "click again to confirm" : "delete"}
    >
      {armed ? "✓" : "×"}
    </button>
  );
}

function RenameInput({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (newName: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="tab-rename-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => onCommit(value.trim() || initial)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit(value.trim() || initial);
        if (e.key === "Escape") onCommit(initial);
      }}
    />
  );
}

// =================== New tab form ===================

interface NewTabFormProps {
  suggestions: { name: string; cwd: string }[];
  defaultCwd: string;
  forwardRef: React.RefObject<HTMLDivElement>;
  onCancel: () => void;
  onCreate: (name: string, cwd: string) => void;
}

function NewTabForm({
  suggestions,
  defaultCwd,
  forwardRef,
  onCancel,
  onCreate,
}: NewTabFormProps) {
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const nameRef = useRef<HTMLInputElement>(null);

  // Keep cwd in sync if defaultCwd arrives late (e.g. ws connected after mount)
  useEffect(() => {
    if (!cwd && defaultCwd) setCwd(defaultCwd);
  }, [defaultCwd, cwd]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = () => {
    const n = name.trim();
    const c = cwd.trim();
    if (!n || !c) return;
    onCreate(n, c);
  };

  const pickFolder = async () => {
    try {
      const mod = await import("@tauri-apps/plugin-dialog");
      const result = await mod.open({
        directory: true,
        multiple: false,
        defaultPath: cwd || defaultCwd || undefined,
        title: "Pick a working directory",
      });
      if (typeof result === "string") {
        setCwd(result);
      }
    } catch (err) {
      console.error("folder picker failed (running outside Tauri?):", err);
    }
  };

  return (
    <div ref={forwardRef} className="new-tab-form">
      <div className="new-tab-form-row">
        <label>NAME</label>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my work"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="new-tab-form-row">
        <label>PATH</label>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="C:\Users\..."
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            style={{ flex: 1 }}
          />
          <button className="path-picker-btn" onClick={pickFolder} title="Browse for folder">
            📁
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="new-tab-suggestions">
          <div className="new-tab-suggestions-label">recent paths:</div>
          {suggestions.map((s) => (
            <button
              key={s.cwd}
              className="new-tab-suggestion"
              onClick={() => {
                setCwd(s.cwd);
                if (!name) setName(s.name);
              }}
              title={s.cwd}
            >
              <span className="new-tab-suggestion-name">{s.name}</span>
              <span className="new-tab-suggestion-cwd">{shortenPath(s.cwd)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="new-tab-form-actions">
        <button className="new-tab-cancel" onClick={onCancel}>
          CANCEL
        </button>
        <button className="new-tab-create" onClick={submit} disabled={!name.trim() || !cwd.trim()}>
          CREATE
        </button>
      </div>
    </div>
  );
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function shortenPath(p: string): string {
  const m = p.match(/^[A-Z]:[\\/]Users[\\/][^\\/]+[\\/](.*)$/i);
  if (m) return "~/" + m[1].replace(/\\/g, "/");
  const m2 = p.match(/^\/home\/[^\/]+\/(.*)$/) || p.match(/^\/Users\/[^\/]+\/(.*)$/);
  if (m2) return "~/" + m2[1];
  return p;
}

export const LeftPanel = memo(LeftPanelImpl);
