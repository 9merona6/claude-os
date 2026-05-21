import { memo, useEffect, useState } from "react";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; notes: string | null; installer: UpdateHandle }
  | { status: "downloading"; version: string; progress: number; total: number | null }
  | { status: "installing"; version: string }
  | { status: "ready" } // installed, awaiting restart
  | { status: "error"; message: string };

// Loose type for the Tauri Update object — we don't depend on the package
// type at module-load time so the file still compiles in browser dev mode.
interface UpdateHandle {
  version: string;
  body?: string | null;
  downloadAndInstall: (onProgress?: (e: ProgressEvent) => void) => Promise<void>;
}
interface ProgressEvent {
  event: "Started" | "Progress" | "Finished";
  data?: { contentLength?: number; chunkLength?: number };
}

function UpdateBannerImpl() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  // Auto-check once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState({ status: "checking" });
        const mod = await import("@tauri-apps/plugin-updater");
        const update = await mod.check();
        if (cancelled) return;
        if (update) {
          setState({
            status: "available",
            version: update.version,
            notes: update.body ?? null,
            installer: update as unknown as UpdateHandle,
          });
        } else {
          setState({ status: "idle" });
        }
      } catch (err) {
        if (cancelled) return;
        // Most commonly: "Tauri API not available" when running in browser dev mode
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not available") || msg.includes("Forbidden")) {
          setState({ status: "idle" });
        } else {
          setState({ status: "error", message: msg });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const installNow = async () => {
    if (state.status !== "available") return;
    const update = state.installer;
    setState({ status: "downloading", version: update.version, progress: 0, total: null });
    try {
      let downloaded = 0;
      let contentLength: number | null = null;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          contentLength = e.data?.contentLength ?? null;
          setState({
            status: "downloading",
            version: update.version,
            progress: 0,
            total: contentLength,
          });
        } else if (e.event === "Progress") {
          downloaded += e.data?.chunkLength ?? 0;
          setState({
            status: "downloading",
            version: update.version,
            progress: downloaded,
            total: contentLength,
          });
        } else if (e.event === "Finished") {
          setState({ status: "installing", version: update.version });
        }
      });
      setState({ status: "ready" });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const restartNow = async () => {
    try {
      const mod = await import("@tauri-apps/plugin-process");
      await mod.relaunch();
    } catch (err) {
      console.error("relaunch failed:", err);
    }
  };

  if (state.status === "idle" || state.status === "checking") return null;

  let content: React.ReactNode = null;
  let extraClass = "";

  switch (state.status) {
    case "available":
      content = (
        <>
          <span className="update-banner-icon">⬆</span>
          <span>
            새 버전 <strong>v{state.version}</strong> 가 사용 가능합니다
          </span>
          <button className="update-banner-action" onClick={installNow}>
            지금 설치
          </button>
          <button
            className="update-banner-dismiss"
            onClick={() => setState({ status: "idle" })}
            title="dismiss"
          >
            ×
          </button>
        </>
      );
      break;
    case "downloading": {
      const pct =
        state.total && state.total > 0
          ? Math.round((state.progress / state.total) * 100)
          : null;
      content = (
        <>
          <span className="update-banner-icon">⬇</span>
          <span>
            v{state.version} 다운로드 중{pct !== null ? `… ${pct}%` : "…"}
          </span>
          <div className="update-banner-progress">
            <div
              className="update-banner-progress-fill"
              style={{ width: pct !== null ? `${pct}%` : "30%" }}
            />
          </div>
        </>
      );
      break;
    }
    case "installing":
      content = (
        <>
          <span className="update-banner-icon">⚙</span>
          <span>v{state.version} 설치 중…</span>
        </>
      );
      break;
    case "ready":
      extraClass = " ready";
      content = (
        <>
          <span className="update-banner-icon">✓</span>
          <span>업데이트 완료 — 앱 재시작이 필요합니다</span>
          <button className="update-banner-action" onClick={restartNow}>
            재시작
          </button>
        </>
      );
      break;
    case "error":
      extraClass = " error";
      content = (
        <>
          <span className="update-banner-icon">⚠</span>
          <span>업데이트 실패: {state.message}</span>
          <button
            className="update-banner-dismiss"
            onClick={() => setState({ status: "idle" })}
          >
            ×
          </button>
        </>
      );
      break;
  }

  return <div className={`update-banner${extraClass}`}>{content}</div>;
}

export const UpdateBanner = memo(UpdateBannerImpl);
