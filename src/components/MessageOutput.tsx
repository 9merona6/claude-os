import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { diffLines } from "diff";
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

  // For each entry, decide whether to show its own header. Consecutive
  // Claude-side entries (assistant text, thinking, tool calls) share a single
  // CLAUDE RESPONSE header at the top of the group.
  const showHeader: boolean[] = (() => {
    const result: boolean[] = [];
    let claudeGroupOpen = false;
    for (const e of entries) {
      if (e.kind === "user" || e.kind === "system" || e.kind === "error") {
        result.push(true);
        claudeGroupOpen = false;
      } else if (e.kind === "assistant" || e.kind === "thinking") {
        result.push(!claudeGroupOpen);
        claudeGroupOpen = true;
      } else {
        // tool_use / tool_result — own card style, doesn't use msg-head, but
        // it means we're still inside the same claude turn so keep the flag
        result.push(true);
        claudeGroupOpen = true;
      }
    }
    return result;
  })();

  return (
    <div className="output" ref={ref}>
      {entries.map((e, i) => (
        <MessageLine key={i} entry={e} showHeader={showHeader[i]} />
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

// Hide chatty success confirmations from file/todo tools. Errors and Read /
// Bash / Grep output still show through.
const NOISE_RESULT_PATTERNS: RegExp[] = [
  /has been (updated|created|written|saved|edited|moved|deleted) successfully/i,
  /^File (created|written|updated|saved)/i,
  /^Applied \d+ edits?/i,
  /^Todos? (updated|saved|created)/i,
  /no need to (Read|read) it back/i,
  /file state is current in your context/i,
];

function isNoiseToolResult(content: string, isError: boolean): boolean {
  if (isError) return false;
  return NOISE_RESULT_PATTERNS.some((p) => p.test(content));
}

function MessageLine({ entry, showHeader }: { entry: TerminalEntry; showHeader: boolean }) {
  const time = nowTime();

  if (entry.kind === "tool_result" && isNoiseToolResult(entry.content, entry.is_error)) {
    return null;
  }

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
        <div className={`msg ai${showHeader ? "" : " no-head"}`}>
          {showHeader && (
            <div className="msg-head">
              <span className="tag">CLAUDE</span>
              <span>RESPONSE</span>
              <span className="time">{time}</span>
            </div>
          )}
          <div className="msg-body md">
            <Markdown text={entry.text} />
          </div>
        </div>
      );
    case "thinking":
      return (
        <div className={`msg thinking${showHeader ? "" : " no-head"}`}>
          {showHeader && (
            <div className="msg-head">
              <span className="tag">THINK</span>
              <span>INTERNAL REASONING</span>
              <span className="time">{time}</span>
            </div>
          )}
          <div className="msg-body dim italic">
            <Markdown text={entry.text} />
          </div>
        </div>
      );
    case "tool_use":
      return <ToolUseCard name={entry.name} input={entry.input} id={entry.id} />;
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

// =================== Markdown ===================

interface CodeProps {
  className?: string;
  children?: React.ReactNode;
}

function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ({ className, children, ...props }: CodeProps) => {
          const match = /language-(\w+)/.exec(className ?? "");
          const code = String(children ?? "").replace(/\n$/, "");
          const inline = !match && !code.includes("\n");
          if (inline) {
            return (
              <code className="md-inline-code" {...props}>
                {children}
              </code>
            );
          }
          return (
            <SyntaxHighlighter
              language={match?.[1] ?? "text"}
              style={atomDark}
              PreTag="div"
              customStyle={{
                margin: "10px 0",
                padding: "12px 14px",
                background: "rgba(0, 8, 14, 0.6)",
                border: "1px solid rgba(107, 240, 255, 0.15)",
                borderRadius: 3,
                fontSize: 11.5,
              }}
            >
              {code}
            </SyntaxHighlighter>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// =================== Tool-specific cards ===================

interface ToolUseCardProps {
  name: string;
  input: unknown;
  id: string;
}

function ToolUseCard({ name, input, id: _id }: ToolUseCardProps) {
  const inp = (input ?? {}) as Record<string, unknown>;
  const filePath = typeof inp.file_path === "string" ? inp.file_path : null;
  const content = typeof inp.content === "string" ? inp.content : null;
  const oldString = typeof inp.old_string === "string" ? inp.old_string : null;
  const newString = typeof inp.new_string === "string" ? inp.new_string : null;
  const command = typeof inp.command === "string" ? inp.command : null;
  const pattern = typeof inp.pattern === "string" ? inp.pattern : null;
  const url = typeof inp.url === "string" ? inp.url : null;
  const query = typeof inp.query === "string" ? inp.query : null;

  // Each card has its own collapse state. Default = expanded (full content).
  const [collapsed, setCollapsed] = useState(false);

  // Write / MultiEdit: 경로 + 컨텐츠 전체
  if (name === "Write" || name === "MultiEdit") {
    return (
      <CollapsibleCard
        header={<ToolHeader name={name} subtitle={filePath ?? "—"} />}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        hasBody={Boolean(content)}
      >
        {content && <CodeBlock text={content} />}
      </CollapsibleCard>
    );
  }

  if (name === "Edit" && oldString !== null && newString !== null) {
    const stats = computeDiffStats(oldString, newString);
    return (
      <CollapsibleCard
        header={
          <EditHeader
            filePath={filePath}
            summary={`Added ${stats.added} line${stats.added === 1 ? "" : "s"}, removed ${stats.removed} line${stats.removed === 1 ? "" : "s"}`}
          />
        }
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        hasBody
      >
        <DiffBlock oldStr={oldString} newStr={newString} />
      </CollapsibleCard>
    );
  }

  if (name === "Read") {
    // 본문 없음 — 경로만
    return (
      <div className="tool-call expanded">
        <ToolHeader name={name} subtitle={filePath ?? "—"} />
      </div>
    );
  }

  if (name === "Bash" || name === "PowerShell") {
    const isMultiline = (command ?? "").includes("\n");
    return (
      <CollapsibleCard
        header={
          <ToolHeader
            name={name}
            subtitle={isMultiline ? `${command?.split("\n").length} lines` : (command ?? "—")}
          />
        }
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        hasBody={isMultiline && Boolean(command)}
      >
        {command && <CodeBlock text={command} />}
      </CollapsibleCard>
    );
  }

  if (name === "Grep" || name === "Glob") {
    return (
      <div className="tool-call expanded">
        <ToolHeader name={name} subtitle={pattern ?? "—"} />
      </div>
    );
  }

  if (name === "WebFetch" || name === "WebSearch") {
    return (
      <div className="tool-call expanded">
        <ToolHeader name={name} subtitle={url ?? query ?? "—"} />
      </div>
    );
  }

  if (name === "TodoWrite") {
    const todos = (inp.todos ?? []) as Array<{ content?: string; status?: string }>;
    return (
      <div className="tool-call expanded">
        <ToolHeader name={name} subtitle={`${todos.length} items`} />
      </div>
    );
  }

  // Fallback — 못 알아보는 도구는 JSON 전체 보여줌 (접을 수 있음)
  return (
    <CollapsibleCard
      header={<ToolHeader name={name} subtitle="" />}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      hasBody
    >
      <CodeBlock text={JSON.stringify(input, null, 2)} />
    </CollapsibleCard>
  );
}

interface CollapsibleCardProps {
  header: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  hasBody: boolean;
  children?: React.ReactNode;
}

function CollapsibleCard({ header, collapsed, onToggle, hasBody, children }: CollapsibleCardProps) {
  return (
    <div className="tool-call expanded">
      <div className="tool-call-header-row">
        {hasBody && (
          <button
            className="tool-toggle"
            onClick={onToggle}
            title={collapsed ? "expand" : "collapse"}
          >
            {collapsed ? "▶" : "▼"}
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
      </div>
      {hasBody && !collapsed && <div className="tool-call-body">{children}</div>}
    </div>
  );
}

function ToolHeader({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="tool-call-header">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ width: 13, height: 13, color: "var(--cyan)", flexShrink: 0 }}
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="tool-name">{name}</span>
      {subtitle && <span className="tool-args">{shortenPath(subtitle)}</span>}
    </div>
  );
}

function EditHeader({ filePath, summary }: { filePath: string | null; summary: string }) {
  return (
    <div className="tool-call-header">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ width: 13, height: 13, color: "var(--cyan)", flexShrink: 0 }}
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      <span className="tool-name">Update</span>
      {filePath && <span className="tool-args">({shortenPath(filePath)})</span>}
      <span className="tool-diff-summary">{summary}</span>
    </div>
  );
}

function shortenPath(p: string): string {
  // Strip CWD-ish prefix if present so the display path is shorter
  // e.g., C:\Users\dev.ljm\my-claude-terminal\src\... → src\...
  const m = p.match(/^[A-Z]:[\\/]Users[\\/][^\\/]+[\\/][^\\/]+[\\/](.*)$/i);
  if (m) return m[1];
  const m2 = p.match(/^\/(?:Users|home)\/[^\/]+\/[^\/]+\/(.*)$/);
  if (m2) return m2[1];
  return p;
}

function CodeBlock({ text }: { text: string }) {
  const lines = text.split("\n").length;
  return (
    <pre className="tool-snippet">
      {text}
      <div className="tool-snippet-meta">{lines} lines</div>
    </pre>
  );
}

interface DiffRow {
  type: "context" | "add" | "del";
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

function buildDiffRows(oldStr: string, newStr: string): DiffRow[] {
  const parts = diffLines(oldStr, newStr);
  const rows: DiffRow[] = [];
  let oldN = 1;
  let newN = 1;
  for (const part of parts) {
    // diffLines may include a trailing newline on the value; split and drop empty tail
    const lines = part.value.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    for (const line of lines) {
      if (part.added) {
        rows.push({ type: "add", oldLine: null, newLine: newN, text: line });
        newN += 1;
      } else if (part.removed) {
        rows.push({ type: "del", oldLine: oldN, newLine: null, text: line });
        oldN += 1;
      } else {
        rows.push({ type: "context", oldLine: oldN, newLine: newN, text: line });
        oldN += 1;
        newN += 1;
      }
    }
  }
  return rows;
}

function computeDiffStats(oldStr: string, newStr: string): { added: number; removed: number } {
  const parts = diffLines(oldStr, newStr);
  let added = 0;
  let removed = 0;
  for (const part of parts) {
    const lines = part.value.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    if (part.added) added += lines.length;
    else if (part.removed) removed += lines.length;
  }
  return { added, removed };
}

function DiffBlock({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const rows = buildDiffRows(oldStr, newStr);
  const maxLineNum = Math.max(
    ...rows.map((r) => Math.max(r.oldLine ?? 0, r.newLine ?? 0)),
    1,
  );
  const numWidth = String(maxLineNum).length;
  return (
    <pre className="tool-diff">
      {rows.map((row, i) => (
        <div key={i} className={`diff-line ${row.type}`}>
          <span className="diff-lineno" style={{ minWidth: `${numWidth + 1}ch` }}>
            {row.type === "add"
              ? row.newLine
              : row.type === "del"
                ? row.oldLine
                : row.newLine}
          </span>
          <span className="diff-marker">
            {row.type === "add" ? "+" : row.type === "del" ? "-" : " "}
          </span>
          <span className="diff-text">{row.text}</span>
        </div>
      ))}
    </pre>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export const MessageOutput = memo(MessageOutputImpl);
