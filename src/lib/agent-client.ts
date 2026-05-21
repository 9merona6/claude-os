import type { ServerEvent } from "./types";

const DEFAULT_URL = "ws://127.0.0.1:7891";

type Listener = (evt: ServerEvent) => void;
type ConnectionListener = (connected: boolean) => void;

export class AgentClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private connListeners = new Set<ConnectionListener>();
  private reconnectTimer: number | null = null;
  private url: string;

  constructor(url: string = DEFAULT_URL) {
    this.url = url;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connListeners.forEach((l) => l(true));
    };

    this.ws.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as ServerEvent;
        this.listeners.forEach((l) => l(evt));
      } catch (err) {
        console.error("invalid event:", err);
      }
    };

    this.ws.onclose = () => {
      this.connListeners.forEach((l) => l(false));
      // auto-reconnect after 2s
      if (this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    this.ws.onerror = (err) => {
      console.error("ws error", err);
    };
  }

  disconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  sendPrompt(text: string) {
    this.send({ type: "prompt", text });
  }

  abort() {
    this.send({ type: "abort" });
  }

  refreshPlanUsage() {
    this.send({ type: "refresh_plan_usage" });
  }

  setModel(model: string) {
    this.send({ type: "set_model", model });
  }

  switchSession(sessionId: string, cwd: string) {
    this.send({ type: "switch_session", session_id: sessionId, cwd });
  }

  newSession(cwd: string, projectName: string) {
    this.send({ type: "new_session", cwd, project_name: projectName });
  }

  clearSession() {
    this.send({ type: "clear_session" });
  }

  deleteClaudeSession(sessionId: string) {
    this.send({ type: "delete_claude_session", session_id: sessionId });
  }

  private send(payload: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  onEvent(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onConnection(l: ConnectionListener): () => void {
    this.connListeners.add(l);
    return () => this.connListeners.delete(l);
  }
}
