import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentClient } from "./lib/agent-client";
import type {
  ClaudeSession,
  DailyTokens,
  PlanUsage,
  ServerEvent,
  TerminalEntry,
  Todo,
  UsageSnapshot,
} from "./lib/types";
import { loadTabs, newTabId, saveTabs, type UserTab } from "./lib/tabs";
import {
  loadSessionModels,
  saveSessionModels,
  type SessionModels,
} from "./lib/sessionModels";
import { BgLayers } from "./components/BgLayers";
import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/LeftPanel";
import { NeuralOrb, type OrbState } from "./components/NeuralOrb";
import { MessageOutput } from "./components/MessageOutput";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { PromptInput } from "./components/PromptInput";
import { ModelPicker } from "./components/ModelPicker";
import { UpdateBanner } from "./components/UpdateBanner";

const EMPTY_USAGE: UsageSnapshot = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
  timestamp: Date.now(),
};

export default function App() {
  const client = useMemo(() => new AgentClient(), []);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [usage, setUsage] = useState<UsageSnapshot>(EMPTY_USAGE);
  const [history, setHistory] = useState<UsageSnapshot[]>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [planUsageAt, setPlanUsageAt] = useState<number>(0);
  const [planUsageError, setPlanUsageError] = useState<string | null>(null);
  const [dailyTokens, setDailyTokens] = useState<DailyTokens[]>([]);
  const [model, setModel] = useState<string>("claude-opus-4-7");
  const [homeDir, setHomeDir] = useState<string>("");
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([]);
  const [tabs, setTabs] = useState<UserTab[]>(() => loadTabs());
  const [sessionModels, setSessionModels] = useState<SessionModels>(() => loadSessionModels());
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [activeClaudeSessionId, setActiveClaudeSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [recentlyStreamed, setRecentlyStreamed] = useState(false);

  useEffect(() => {
    client.connect();
    const offConn = client.onConnection(setConnected);
    const offEvt = client.onEvent((evt: ServerEvent) => {
      switch (evt.type) {
        case "session_start":
          setSessionId(evt.sessionId);
          setEntries((e) => [...e, { kind: "system", text: `link · ${evt.sessionId.slice(0, 10)}…` }]);
          // Bind the new session ID to whichever tab is currently active
          setActiveTabId((curActive) => {
            if (curActive) {
              setTabs((prev) => {
                const next = prev.map((t) =>
                  t.id === curActive ? { ...t, last_session_id: evt.sessionId } : t,
                );
                saveTabs(next);
                return next;
              });
            }
            return curActive;
          });
          break;
        case "user_echo":
          setEntries((e) => [...e, { kind: "user", text: evt.text }]);
          setBusy(true);
          setRecentlyStreamed(false);
          break;
        case "assistant_text":
          setEntries((e) => [...e, { kind: "assistant", text: evt.text }]);
          setRecentlyStreamed(true);
          setTimeout(() => setRecentlyStreamed(false), 800);
          break;
        case "thinking":
          setEntries((e) => [...e, { kind: "thinking", text: evt.text }]);
          break;
        case "tool_use":
          setEntries((e) => [
            ...e,
            { kind: "tool_use", name: evt.name, input: evt.input, id: evt.id },
          ]);
          break;
        case "tool_result":
          setEntries((e) => [
            ...e,
            {
              kind: "tool_result",
              tool_use_id: evt.tool_use_id,
              content: evt.content,
              is_error: evt.is_error,
            },
          ]);
          break;
        case "todos":
          setTodos(evt.todos);
          break;
        case "usage":
          setUsage(evt.usage);
          setHistory((h) => [...h, evt.usage]);
          break;
        case "result":
          setEntries((e) => [
            ...e,
            {
              kind: "system",
              text: `done · ${evt.num_turns} turns · ${(evt.duration_ms / 1000).toFixed(1)}s`,
            },
          ]);
          break;
        case "plan_usage":
          setPlanUsage(evt.usage);
          setPlanUsageAt(evt.fetched_at);
          setPlanUsageError(null);
          break;
        case "plan_usage_error":
          setPlanUsageError(evt.message);
          break;
        case "daily_tokens":
          setDailyTokens(evt.daily);
          break;
        case "model":
          setModel(evt.model);
          break;
        case "claude_sessions":
          setClaudeSessions(evt.sessions);
          break;
        case "host_info":
          setHomeDir(evt.home_dir);
          break;
        case "session_loading":
          setLoadingSession(true);
          setEntries([
            { kind: "system", text: `loading ${evt.session_id.slice(0, 8)}…` },
          ]);
          setTodos([]);
          break;
        case "session_loaded":
          setLoadingSession(false);
          setEntries((e) => [
            ...e,
            {
              kind: "system",
              text: `resumed · ${evt.message_count} msgs loaded · continuing this session`,
            },
          ]);
          break;
        case "error":
          setEntries((e) => [...e, { kind: "error", text: evt.message }]);
          break;
        case "idle":
          setBusy(false);
          setRecentlyStreamed(false);
          break;
      }
    });
    return () => {
      offConn();
      offEvt();
      client.disconnect();
    };
  }, [client]);

  const handleSubmit = useCallback(
    (text: string) => {
      client.sendPrompt(text);
    },
    [client],
  );

  const handleAbort = useCallback(() => {
    client.abort();
  }, [client]);

  const handleRefreshUsage = useCallback(() => {
    client.refreshPlanUsage();
  }, [client]);

  // Switch the sidecar's model immediately and reflect locally without
  // waiting for the echo. Used both when user picks a model and when the
  // active tab/session changes (each remembers its own preferred model).
  const applyModel = useCallback(
    (m: string) => {
      setModel(m);
      client.setModel(m);
    },
    [client],
  );

  const handleModelChange = useCallback(
    (m: string) => {
      applyModel(m);
      // Persist as the preferred model for whichever tab/session is active
      if (activeTabId) {
        setTabs((prev) => {
          const next = prev.map((t) => (t.id === activeTabId ? { ...t, model: m } : t));
          saveTabs(next);
          return next;
        });
      } else if (activeClaudeSessionId) {
        setSessionModels((prev) => {
          const next = { ...prev, [activeClaudeSessionId]: m };
          saveSessionModels(next);
          return next;
        });
      }
    },
    [applyModel, activeTabId, activeClaudeSessionId],
  );

  const handleSelectTab = useCallback(
    (tab: UserTab) => {
      if (activeTabId === tab.id) return;
      setActiveTabId(tab.id);
      setActiveClaudeSessionId(null);
      setEntries([]);
      setTodos([]);
      // Switch sidecar to this tab's preferred model (if set)
      if (tab.model) applyModel(tab.model);
      if (tab.last_session_id) {
        client.switchSession(tab.last_session_id, tab.cwd);
      } else {
        client.newSession(tab.cwd, tab.name);
        setEntries([{ kind: "system", text: `new session · ${tab.name}` }]);
      }
    },
    [activeTabId, client, applyModel],
  );

  const handleSelectClaudeSession = useCallback(
    (s: ClaudeSession) => {
      if (activeClaudeSessionId === s.session_id) return;
      setActiveClaudeSessionId(s.session_id);
      setActiveTabId(null);
      setEntries([]);
      setTodos([]);
      const sessModel = sessionModels[s.session_id];
      if (sessModel) applyModel(sessModel);
      client.switchSession(s.session_id, s.cwd);
    },
    [activeClaudeSessionId, client, sessionModels, applyModel],
  );

  const handleDeleteClaudeSession = useCallback(
    (sessionId: string) => {
      if (activeClaudeSessionId === sessionId) {
        setActiveClaudeSessionId(null);
        setEntries([]);
        setTodos([]);
      }
      client.deleteClaudeSession(sessionId);
    },
    [activeClaudeSessionId, client],
  );

  // "Renaming" an auto-detected session promotes it into a UserTab linked to
  // that session_id. The original card disappears (deduped against tabs) and
  // the new named tab takes its place.
  const handlePromoteToTab = useCallback(
    (s: ClaudeSession, newName: string) => {
      const tab: UserTab = {
        id: newTabId(),
        name: newName,
        cwd: s.cwd,
        last_session_id: s.session_id,
        model: sessionModels[s.session_id] ?? null,
        created_at: Date.now(),
      };
      setTabs((prev) => {
        const next = [...prev, tab];
        saveTabs(next);
        return next;
      });
      if (activeClaudeSessionId === s.session_id) {
        setActiveClaudeSessionId(null);
        setActiveTabId(tab.id);
      }
    },
    [sessionModels, activeClaudeSessionId],
  );

  const handleCreateTab = useCallback(
    (name: string, cwd: string) => {
      const tab: UserTab = {
        id: newTabId(),
        name,
        cwd,
        last_session_id: null,
        model: null,
        created_at: Date.now(),
      };
      setTabs((prev) => {
        const next = [...prev, tab];
        saveTabs(next);
        return next;
      });
      // Auto-activate the newly created tab
      setActiveTabId(tab.id);
      setActiveClaudeSessionId(null);
      setEntries([{ kind: "system", text: `new session · ${tab.name}` }]);
      setTodos([]);
      client.newSession(tab.cwd, tab.name);
    },
    [client],
  );

  const handleDeleteTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        saveTabs(next);
        return next;
      });
      if (activeTabId === tabId) {
        setActiveTabId(null);
        setEntries([]);
        setTodos([]);
        client.clearSession();
      }
    },
    [activeTabId, client],
  );

  const handleRenameTab = useCallback((tabId: string, newName: string) => {
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === tabId ? { ...t, name: newName } : t));
      saveTabs(next);
      return next;
    });
  }, []);

  // Tool counts derived from this session's entries
  const toolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      if (e.kind === "tool_use") {
        counts[e.name] = (counts[e.name] ?? 0) + 1;
      }
    }
    return counts;
  }, [entries]);

  // Message count for LeftPanel (user + assistant only)
  const msgCount = useMemo(
    () => entries.filter((e) => e.kind === "user" || e.kind === "assistant").length,
    [entries],
  );

  const orbState: OrbState = !busy ? "idle" : recentlyStreamed ? "responding" : "thinking";

  return (
    <>
      <BgLayers />
      <UpdateBanner />
      <div className="app">
        <TopBar connected={connected} busy={busy} sessionId={sessionId} />

        <LeftPanel
          connected={connected}
          busy={busy || loadingSession}
          msgCount={msgCount}
          usage={usage}
          todos={todos}
          tabs={tabs}
          activeTabId={activeTabId}
          activeClaudeSessionId={activeClaudeSessionId}
          claudeSessions={claudeSessions}
          homeDir={homeDir}
          onSelectTab={handleSelectTab}
          onSelectClaudeSession={handleSelectClaudeSession}
          onCreateTab={handleCreateTab}
          onDeleteTab={handleDeleteTab}
          onRenameTab={handleRenameTab}
          onDeleteClaudeSession={handleDeleteClaudeSession}
          onPromoteToTab={handlePromoteToTab}
        />

        <main className="panel center-panel">
          <div className="panel-corner-tr" />
          <div className="panel-corner-bl" />
          <div className="panel-header">
            <span>◈ Neural Interface</span>
            <ModelPicker current={model} onChange={handleModelChange} disabled={busy} />
            <div className="dot" />
          </div>
          <NeuralOrb state={orbState} model={model} />
          <MessageOutput entries={entries} busy={busy} />
        </main>

        <TelemetryPanel
          current={usage}
          planUsage={planUsage}
          planUsageAt={planUsageAt}
          planUsageError={planUsageError}
          dailyTokens={dailyTokens}
          toolCounts={toolCounts}
          onRefreshUsage={handleRefreshUsage}
        />

        <PromptInput
          onSubmit={handleSubmit}
          onAbort={handleAbort}
          disabled={!connected}
          busy={busy}
        />
      </div>
    </>
  );
}
