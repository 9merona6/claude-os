import { memo, useEffect, useState } from "react";

interface Props {
  connected: boolean;
  busy: boolean;
  sessionId: string | null;
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const pad = (n: number) => String(n).padStart(2, "0");

async function openExternal(url: string): Promise<void> {
  try {
    const mod = await import("@tauri-apps/plugin-opener");
    await mod.openUrl(url);
  } catch (err) {
    // Fallback for browser mode (non-Tauri)
    console.warn("opener plugin failed, falling back to window.open", err);
    window.open(url, "_blank");
  }
}

function TopBarImpl({ connected, busy, sessionId }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const clock = `${pad(now.getHours())} : ${pad(now.getMinutes())} : ${pad(now.getSeconds())}`;
  const date = `${DAYS[now.getDay()]} · ${MONTHS[now.getMonth()]} ${pad(now.getDate())} · ${now.getFullYear()}`;

  const tagLabel = connected
    ? (busy ? "WORKING" : "READY")
    : "OFFLINE";
  const sessionShort = sessionId ? `${sessionId.slice(0, 8)}…` : "—";

  return (
    <header className="panel topbar">
      <div className="panel-corner-tr" />
      <div className="panel-corner-bl" />

      <div className="brand">
        <div className="brand-mark">
          <svg
            viewBox="0 0 32 32"
            className="mark-glow"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            style={{ color: "var(--cyan)" }}
          >
            <circle cx="16" cy="16" r="13" />
            <circle cx="16" cy="16" r="8" strokeDasharray="3 2" />
            <circle cx="16" cy="16" r="2.5" fill="currentColor" />
            <line x1="16" y1="1" x2="16" y2="5" />
            <line x1="16" y1="27" x2="16" y2="31" />
            <line x1="1" y1="16" x2="5" y2="16" />
            <line x1="27" y1="16" x2="31" y2="16" />
          </svg>
        </div>
        <div>
          <div className="brand-text">CLAUDE&nbsp;OS</div>
          <div className="brand-sub">v 0.1 · NEURAL TERMINAL</div>
        </div>
      </div>

      <div className="topbar-center">
        <div className="session-tag">
          <div className={`pulse ${connected ? "" : "off"}`} />
          <span className="label-name">{tagLabel}</span>
          <span className="label-meta">› {sessionShort}</span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-shortcuts">
          <button
            className="quick-link"
            title="Claude Design"
            onClick={() => openExternal("https://claude.ai/design")}
          >
            🎨 <span>DESIGN</span>
          </button>
          <button
            className="quick-link"
            title="Anthropic Console"
            onClick={() => openExternal("https://console.anthropic.com")}
          >
            ⚙ <span>CONSOLE</span>
          </button>
        </div>
        <div>
          <div className="clock">{clock}</div>
          <div className="clock-meta">{date}</div>
        </div>
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarImpl);

