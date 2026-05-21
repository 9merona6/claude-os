import { memo, useRef, useState } from "react";

interface Props {
  onSubmit: (text: string) => void;
  onAbort: () => void;
  disabled: boolean;
  busy: boolean;
}

function PromptInputImpl({ onSubmit, onAbort, disabled, busy }: Props) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = input.trim();
    if (!text || disabled || busy) return;
    onSubmit(text);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && busy) {
      e.preventDefault();
      onAbort();
    }
  };

  return (
    <footer className="panel bottom-bar">
      <div className="panel-corner-tr" />
      <div className="panel-corner-bl" />
      <div className="prompt-wrap">
        <div className="prompt-prefix">›_</div>
        <textarea
          ref={ref}
          className="prompt-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            disabled
              ? "Connecting to neural link…"
              : busy
                ? "Working… (Esc to interrupt)"
                : "Speak to Claude. Enter to send, Shift+Enter for newline."
          }
          disabled={disabled}
        />
        <div className="prompt-actions">
          {busy ? (
            <button className="prompt-btn abort" title="Interrupt (Esc)" onClick={onAbort}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              className="prompt-btn send"
              title="Send"
              onClick={submit}
              disabled={disabled || !input.trim()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 12l14 0" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="shortcuts">
        <div className="group">
          <span>
            <kbd>⏎</kbd>SEND
          </span>
          <span>
            <kbd>⇧</kbd>
            <kbd>⏎</kbd>NEWLINE
          </span>
          <span>
            <kbd>ESC</kbd>INTERRUPT
          </span>
        </div>
        <div className="group">
          <span style={{ color: busy ? "var(--amber)" : "var(--text-faint)" }}>
            {busy ? "▶ EXECUTING" : "○ READY"}
          </span>
        </div>
      </div>
    </footer>
  );
}

export const PromptInput = memo(PromptInputImpl);
