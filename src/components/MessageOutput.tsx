import { memo, useEffect, useRef } from "react";
import type { TerminalEntry } from "../lib/types";

interface Props {
  entries: TerminalEntry[];
  busy: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function MessageOutputImpl({ entries, busy }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="output" ref={ref}>
        <div className="msg system">
          <div className="msg-head">
            <span className="tag">SYS</span>
            <span>NEURAL LINK READY</span>
            <span className="time">{nowTime()}</span>
          </div>
          <div className="msg-body dim">
            Awaiting first prompt. Reference files with <span className="inline">@</span>, send with{" "}
            <span className="inline">Enter</span>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="output" ref={ref}>
      {entries.map((e, i) => (
        <MessageLine key={i} entry={e} />
      ))}
      {busy && (
        <div className="msg ai">
          <div className="msg-head">
            <span className="tag">CLAUDE</span>
            <span>STREAMING…</span>
            <span className="time">{nowTime()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageLine({ entry }: { entry: TerminalEntry }) {
  const time = nowTime();
  switch (entry.kind) {
    case "user":
      return (
        <div className="msg user">
          <div className="msg-head">
            <span className="tag">YOU</span>
            <span>PROMPT</span>
            <span className="time">{time}</span>
          </div>
          <div className="msg-body">{entry.text}</div>
        </div>
      );
    case "assistant":
      return (
        <div className="msg ai">
          <div className="msg-head">
            <span className="tag">CLAUDE</span>
            <span>RESPONSE</span>
            <span className="time">{time}</span>
          </div>
          <div className="msg-body">{entry.text}</div>
        </div>
      );
    case "thinking":
      return (
        <div className="msg thinking">
          <div className="msg-head">
            <span className="tag">THINK</span>
            <span>INTERNAL REASONING</span>
            <span className="time">{time}</span>
          </div>
          <div className="msg-body dim italic">{entry.text}</div>
        </div>
      );
    case "tool_use":
      return (
        <div className="tool-call">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: 13, height: 13, color: "var(--cyan)" }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="tool-name">{entry.name}</span>
          <span className="tool-args">{formatInput(entry.input)}</span>
        </div>
      );
    case "tool_result":
      return (
        <div className={`tool-call ${entry.is_error ? "err" : ""}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: 13, height: 13 }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="tool-name">{entry.is_error ? "ERROR" : "RESULT"}</span>
          <span className="tool-args">{truncate(entry.content, 200)}</span>
          <span className="check">{entry.is_error ? "✗" : "✓"}</span>
        </div>
      );
    case "system":
      return (
        <div className="msg system">
          <div className="msg-head">
            <span className="tag">SYS</span>
            <span>{entry.text.toUpperCase()}</span>
            <span className="time">{time}</span>
          </div>
        </div>
      );
    case "error":
      return (
        <div className="msg error">
          <div className="msg-head">
            <span className="tag">ERR</span>
            <span>EXCEPTION</span>
            <span className="time">{time}</span>
          </div>
          <div className="msg-body">{entry.text}</div>
        </div>
      );
  }
}

function formatInput(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input;
  try {
    return truncate(JSON.stringify(input), 200);
  } catch {
    return String(input);
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export const MessageOutput = memo(MessageOutputImpl);

