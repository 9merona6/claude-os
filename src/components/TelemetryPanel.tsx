import { memo, useEffect, useState } from "react";
import type { DailyTokens, PlanUsage, PlanWindow, UsageSnapshot } from "../lib/types";

interface Props {
  current: UsageSnapshot;
  planUsage: PlanUsage | null;
  planUsageAt: number;
  planUsageError: string | null;
  dailyTokens: DailyTokens[];
  toolCounts: Record<string, number>;
  onRefreshUsage: () => void;
}

const CTX_WINDOW = 1_000_000; // Opus 4.7
const COMPACT_AT = 0.9;

function TelemetryPanelImpl({
  current,
  planUsage,
  planUsageAt,
  planUsageError,
  dailyTokens,
  toolCounts,
  onRefreshUsage,
}: Props) {
  // Tick every 30s so reset countdowns stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  // Clear the refreshing state once new data arrives (or after 2s timeout)
  useEffect(() => {
    if (!refreshing) return;
    const t = setTimeout(() => setRefreshing(false), 2000);
    return () => clearTimeout(t);
  }, [planUsageAt, refreshing]);

  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    onRefreshUsage();
  };

  const ctxUsed = current.total_tokens;
  const ctxRatio = Math.min(1, ctxUsed / CTX_WINDOW);
  const ctxPct = ctxRatio * 100;
  const ctxNear = ctxRatio >= COMPACT_AT;

  const planTier = planUsage?.subscription_type
    ? planUsage.subscription_type.toUpperCase() +
      (planUsage.rate_limit_tier ? ` · ${formatTier(planUsage.rate_limit_tier)}` : "")
    : "CLAUDE.AI";

  return (
    <aside className="panel right-panel">
      <div className="panel-corner-tr" />
      <div className="panel-corner-bl" />
      <div className="panel-header">
        <span>◈ Telemetry</span>
        <div className="dot" />
      </div>

      {/* Plan Quotas — real API */}
      <div className="stat-block">
        <div
          className="stat-row"
          style={{ alignItems: "center" }}
        >
          <span>Plan Quotas</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--text-faint)", fontSize: 9, letterSpacing: "0.2em" }}>
              {planTier}
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="지금 갱신"
              style={{
                background: "rgba(107, 240, 255, 0.05)",
                border: "1px solid rgba(107, 240, 255, 0.2)",
                color: refreshing ? "var(--text-faint)" : "var(--cyan)",
                borderRadius: 3,
                padding: "2px 4px",
                cursor: refreshing ? "default" : "pointer",
                display: "grid",
                placeItems: "center",
                width: 22,
                height: 22,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  width: 12,
                  height: 12,
                  animation: refreshing ? "spin 0.8s linear infinite" : undefined,
                }}
              >
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </div>
        </div>

        {planUsageAt > 0 && (
          <div
            style={{
              fontSize: 9,
              color: "var(--text-faint)",
              letterSpacing: "0.1em",
              marginBottom: 8,
              textAlign: "right",
            }}
          >
            {refreshing ? "갱신 중…" : `${formatAge(Date.now() - planUsageAt)} · auto ~30min`}
          </div>
        )}

        {planUsageError && !planUsage && (
          <div
            style={{
              color: "var(--red)",
              fontSize: 10,
              padding: "8px 0",
              fontStyle: "italic",
            }}
          >
            ⚠ {planUsageError}
          </div>
        )}

        <PlanQuotaRow label="5h window" window={planUsage?.five_hour ?? null} />
        <div style={{ height: 12 }} />
        <PlanQuotaRow label="Weekly · all" window={planUsage?.seven_day ?? null} />

        {planUsage?.seven_day_opus && (
          <>
            <div style={{ height: 8 }} />
            <PlanQuotaRow label="Weekly · Opus" window={planUsage.seven_day_opus} compact />
          </>
        )}
        {planUsage?.seven_day_sonnet && (
          <>
            <div style={{ height: 8 }} />
            <PlanQuotaRow label="Weekly · Sonnet" window={planUsage.seven_day_sonnet} compact />
          </>
        )}
      </div>

      {/* Daily Tokens — last 7 days */}
      <WeeklyBarChart daily={dailyTokens} />

      {/* Tool Activity — this session */}
      <ToolActivity counts={toolCounts} />

      {/* Context — only show prominently when near limit */}
      <div className="stat-block">
        <div className="stat-row">
          <span>Context Window</span>
          <span
            className="stat-value"
            style={{
              color: ctxNear ? "var(--red)" : "var(--text)",
              fontSize: 11,
            }}
          >
            {fmtTokens(ctxUsed)} / 1M
          </span>
        </div>
        <div className="token-bar">
          <div
            className="token-bar-fill"
            style={{
              width: `${ctxPct.toFixed(1)}%`,
              background: ctxNear
                ? "linear-gradient(90deg, var(--amber), var(--red))"
                : undefined,
              boxShadow: ctxNear ? "0 0 8px var(--red)" : undefined,
            }}
          />
        </div>
        <div className="stat-meta" style={{ marginTop: 4 }}>
          {ctxNear
            ? "⚠ AUTO-COMPACT IMMINENT"
            : `${fmtTokens(CTX_WINDOW - ctxUsed)} available · compact @ 90%`}
        </div>
      </div>
    </aside>
  );
}

export const TelemetryPanel = memo(TelemetryPanelImpl);

// =================== Plan Quota Row ===================

interface PlanQuotaRowProps {
  label: string;
  window: PlanWindow | null;
  compact?: boolean;
}

function PlanQuotaRow({ label, window: w, compact }: PlanQuotaRowProps) {
  if (!w) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: compact ? 9 : 10,
              letterSpacing: "0.2em",
              color: "var(--text-dim)",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-faint)" }}>—</span>
        </div>
        {!compact && (
          <div className="token-bar" style={{ margin: "0 0 4px" }}>
            <div style={{ width: "0%", height: "100%" }} />
          </div>
        )}
      </div>
    );
  }

  const pct = Math.min(100, w.utilization);
  const over = pct >= 100;
  const high = pct >= 80;
  const fillStyle: React.CSSProperties = {
    width: `${pct.toFixed(1)}%`,
    background: over
      ? "linear-gradient(90deg, #d63a4b, var(--red))"
      : high
        ? "linear-gradient(90deg, var(--amber), #d68f30)"
        : "linear-gradient(90deg, var(--cyan-dim), var(--cyan))",
    boxShadow: over
      ? "0 0 8px var(--red)"
      : high
        ? "0 0 8px var(--amber)"
        : "0 0 8px var(--cyan)",
    transition: "width 0.4s ease",
    height: "100%",
  };
  const pctColor = over ? "var(--red)" : high ? "var(--amber)" : "var(--cyan)";

  const resetMs = new Date(w.resets_at).getTime() - Date.now();
  const resetStr = resetMs > 0 ? formatCountdown(resetMs) : "now";

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: compact ? 9 : 10,
            letterSpacing: "0.2em",
            color: "var(--text-dim)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: compact ? 11 : 13,
            fontWeight: 700,
            color: pctColor,
            textShadow: `0 0 5px ${pctColor}`,
          }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="token-bar" style={{ margin: "0 0 4px", height: compact ? 4 : 6 }}>
        <div style={fillStyle} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          fontSize: 9,
          color: "var(--text-faint)",
          letterSpacing: "0.05em",
        }}
      >
        <span>↺ {resetStr}</span>
      </div>
    </div>
  );
}

// =================== Weekly Bar Chart ===================

const DAY_NAMES_KR = ["일", "월", "화", "수", "목", "금", "토"];

function WeeklyBarChart({ daily }: { daily: DailyTokens[] }) {
  const total = daily.reduce((s, d) => s + d.tokens, 0);
  const max = Math.max(1, ...daily.map((d) => d.tokens));
  const avg = daily.length > 0 ? total / daily.length : 0;

  return (
    <div className="stat-block">
      <div className="stat-row">
        <span>Daily Tokens · 7d</span>
        <span style={{ color: "var(--text-faint)", fontSize: 9, letterSpacing: "0.2em" }}>
          AVG {fmtTokens(avg)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <div className="stat-value big" style={{ fontSize: 20 }}>
          {fmtTokens(total)}
        </div>
        <div className="stat-meta">TOTAL</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "flex-end",
          height: 78,
          padding: "4px 0 8px",
        }}
      >
        {daily.map((d, i) => {
          const isToday = i === daily.length - 1;
          const ratio = d.tokens / max;
          const barH = Math.max(2, ratio * 64);
          return (
            <div
              key={d.date}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
              title={`${d.date}: ${d.tokens.toLocaleString()} tokens`}
            >
              <div
                style={{
                  fontSize: 8,
                  color: isToday ? "var(--cyan)" : "var(--text-faint)",
                  fontFamily: "'JetBrains Mono', monospace",
                  height: 10,
                }}
              >
                {d.tokens > 0 ? fmtTokensShort(d.tokens) : ""}
              </div>
              <div
                style={{
                  width: "100%",
                  height: `${barH}px`,
                  background: isToday
                    ? "linear-gradient(180deg, #ffffff, var(--cyan))"
                    : d.tokens > 0
                      ? "linear-gradient(180deg, var(--cyan), var(--cyan-dim))"
                      : "rgba(107, 240, 255, 0.08)",
                  boxShadow: isToday
                    ? "0 0 8px var(--cyan)"
                    : d.tokens > 0
                      ? "0 0 4px rgba(107, 240, 255, 0.3)"
                      : "none",
                  borderRadius: "1px",
                  transition: "height 0.3s ease",
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? "var(--cyan)" : "var(--text-dim)",
                  textShadow: isToday ? "0 0 4px var(--cyan)" : "none",
                  letterSpacing: "0.1em",
                }}
              >
                {DAY_NAMES_KR[d.day_of_week]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =================== Tool Activity ===================

const TOOL_ICONS: Record<string, string> = {
  Read: "📄",
  Write: "✏️",
  Edit: "✂️",
  MultiEdit: "✂️",
  Bash: "⌘",
  PowerShell: "⌘",
  Grep: "🔍",
  Glob: "📁",
  WebFetch: "🌐",
  WebSearch: "🔎",
  TodoWrite: "📋",
  Task: "🤖",
  TaskCreate: "➕",
  TaskUpdate: "✓",
  NotebookEdit: "📓",
};

function ToolActivity({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const total = entries.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="stat-block">
      <div className="stat-row">
        <span>Tool Activity</span>
        <span style={{ color: "var(--text-faint)", fontSize: 9, letterSpacing: "0.2em" }}>
          SESSION
        </span>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            color: "var(--text-faint)",
            fontSize: 11,
            fontStyle: "italic",
            padding: "8px 0",
          }}
        >
          no tool calls yet
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <div className="stat-value big" style={{ fontSize: 20 }}>
              {total}
            </div>
            <div className="stat-meta">CALLS</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {entries.slice(0, 8).map(([name, n]) => {
              const ratio = n / max;
              return (
                <div
                  key={name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "16px 1fr auto",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 11,
                  }}
                >
                  <span style={{ fontSize: 11 }}>{TOOL_ICONS[name] ?? "•"}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-dim)",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      {name}
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "rgba(107, 240, 255, 0.08)",
                        borderRadius: 1,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${ratio * 100}%`,
                          background: "linear-gradient(90deg, var(--cyan-dim), var(--cyan))",
                          boxShadow: "0 0 4px var(--cyan)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--cyan)",
                      minWidth: 24,
                      textAlign: "right",
                    }}
                  >
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// =================== Utilities ===================

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function fmtTokensShort(n: number): string {
  if (n >= 1_000_000) return Math.round(n / 100_000) / 10 + "M";
  if (n >= 1_000) return Math.round(n / 100) / 10 + "K";
  return n.toString();
}

function formatTier(tier: string): string {
  const m = tier.match(/max_(\d+x)/i);
  if (m) return `MAX ${m[1].replace("x", "×").toUpperCase()}`;
  if (tier.includes("pro")) return "PRO";
  return tier.toUpperCase();
}

function formatAge(ms: number): string {
  if (ms < 60_000) return "방금 갱신";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  return `${hours}시간 전`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
