export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

export interface UsageSnapshot {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
  cost_usd: number;
  timestamp: number;
}

export interface PlanWindow {
  utilization: number; // 0-100
  resets_at: string; // ISO timestamp
}

export interface PlanUsage {
  five_hour: PlanWindow | null;
  seven_day: PlanWindow | null;
  seven_day_opus: PlanWindow | null;
  seven_day_sonnet: PlanWindow | null;
  subscription_type: string | null;
  rate_limit_tier: string | null;
}

export interface DailyTokens {
  date: string; // YYYY-MM-DD
  tokens: number;
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

export interface ClaudeSession {
  session_id: string;
  cwd: string;
  project_name: string;
  status: "live" | "idle" | "cold";
  pid: number | null;
  last_activity_ms: number;
  message_count: number;
}

export type ServerEvent =
  | { type: "session_start"; sessionId: string }
  | { type: "user_echo"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean }
  | { type: "todos"; todos: Todo[] }
  | { type: "usage"; usage: UsageSnapshot }
  | { type: "result"; cost_usd: number; duration_ms: number; num_turns: number; subtype: string }
  | { type: "error"; message: string }
  | { type: "idle" }
  | { type: "plan_usage"; usage: PlanUsage; fetched_at: number }
  | { type: "plan_usage_error"; message: string }
  | { type: "daily_tokens"; daily: DailyTokens[] }
  | { type: "model"; model: string }
  | { type: "claude_sessions"; sessions: ClaudeSession[] }
  | { type: "session_loading"; session_id: string; cwd: string }
  | { type: "session_loaded"; session_id: string; message_count: number }
  | { type: "host_info"; home_dir: string; platform: string };

export type TerminalEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_use"; name: string; input: unknown; id: string }
  | { kind: "tool_result"; tool_use_id: string; content: string; is_error: boolean }
  | { kind: "system"; text: string }
  | { kind: "error"; text: string };
