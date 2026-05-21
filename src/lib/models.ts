export interface ModelInfo {
  id: string;
  label: string; // short display name
  full: string; // full marketing name
  tag: string; // one-line description
  tier: "opus" | "sonnet" | "haiku";
}

export const MODELS: ModelInfo[] = [
  {
    id: "claude-opus-4-7",
    label: "OPUS 4.7",
    full: "Claude Opus 4.7",
    tag: "Most capable · 1M context",
    tier: "opus",
  },
  {
    id: "claude-opus-4-6",
    label: "OPUS 4.6",
    full: "Claude Opus 4.6",
    tag: "Previous gen · 1M context",
    tier: "opus",
  },
  {
    id: "claude-sonnet-4-6",
    label: "SONNET 4.6",
    full: "Claude Sonnet 4.6",
    tag: "Best speed/quality · 1M context",
    tier: "sonnet",
  },
  {
    id: "claude-sonnet-4-5",
    label: "SONNET 4.5",
    full: "Claude Sonnet 4.5",
    tag: "Stable · 200K context",
    tier: "sonnet",
  },
  {
    id: "claude-haiku-4-5",
    label: "HAIKU 4.5",
    full: "Claude Haiku 4.5",
    tag: "Fastest · 200K context",
    tier: "haiku",
  },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export function modelLabel(id: string): string {
  return findModel(id)?.label ?? id.toUpperCase();
}
