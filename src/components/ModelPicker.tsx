import { memo, useEffect, useRef, useState } from "react";
import { MODELS, findModel, modelLabel } from "../lib/models";

interface Props {
  current: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

function ModelPickerImpl({ current, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const info = findModel(current);
  const tierColor = info?.tier === "opus"
    ? "var(--cyan)"
    : info?.tier === "sonnet"
      ? "var(--teal)"
      : "var(--amber)";

  return (
    <div ref={ref} className="model-picker">
      <button
        className="model-picker-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{ color: tierColor, borderColor: open ? tierColor : "rgba(107, 240, 255, 0.18)" }}
      >
        <span className="model-picker-label">{modelLabel(current)}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            width: 10,
            height: 10,
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 0.15s",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="model-picker-menu">
          {MODELS.map((m) => {
            const isSelected = m.id === current;
            const color =
              m.tier === "opus"
                ? "var(--cyan)"
                : m.tier === "sonnet"
                  ? "var(--teal)"
                  : "var(--amber)";
            return (
              <button
                key={m.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`model-picker-item${isSelected ? " selected" : ""}`}
                style={{ borderLeftColor: color }}
              >
                <div className="model-picker-row">
                  <span className="model-picker-name" style={{ color }}>
                    {m.label}
                  </span>
                  {isSelected && <span style={{ color, fontSize: 11 }}>✓</span>}
                </div>
                <div className="model-picker-tag">{m.tag}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ModelPicker = memo(ModelPickerImpl);
