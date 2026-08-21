import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  shellApi,
  type ProgressPayload,
  type ReadyPayload,
  type StartCommand,
} from "../shell";

type Phase = "boot" | "working" | "ready" | "error";

const STAGES = [
  { id: "detect", label: "检测" },
  { id: "download-node", label: "下载 Node" },
  { id: "verify-node", label: "校验" },
  { id: "extract-node", label: "解压" },
  { id: "install-dsh", label: "安装 harness" },
  { id: "start", label: "启动" },
] as const;

const LIVE_CAP = 60;

function mapStage(stage: string | null): string | null {
  if (!stage) return null;
  if (stage === "npm-log") return "install-dsh";
  if (stage.startsWith("update-dsh") || stage === "install-dsh") return "install-dsh";
  if (stage.startsWith("download-node")) return "download-node";
  if (stage.startsWith("verify-node")) return "verify-node";
  if (stage.startsWith("extract-node")) return "extract-node";
  if (stage === "check-update") return "detect";
  if (stage.startsWith("start")) return "start";
  if (stage.startsWith("detect")) return "detect";
  const hit = STAGES.find((s) => stage.startsWith(s.id) || s.id.startsWith(stage));
  return hit?.id ?? null;
}

function stageIndex(stage: string | null): number {
  const mapped = mapStage(stage);
  if (!mapped) return 0;
  const i = STAGES.findIndex((s) => s.id === mapped);
  return i >= 0 ? i : 0;
}

function isLogOnly(stage: string): boolean {
  return stage === "npm-log";
}

function isHeartbeat(message: string): boolean {
  return message.startsWith("…") || message.startsWith("...");
}

type Props = {
  startCommand: StartCommand;
  onReady: (payload: ReadyPayload) => void;
  onError: () => void;
  onBootWorking?: (coldInstall: boolean) => void;
  onOpenSettings: () => void;
  onStealthChange?: (stealth: boolean) => void;
  onStatusMessage?: (message: string) => void;
};

export function BootPanel({
  startCommand,
  onReady,
  onError,
  onBootWorking,
  onOpenSettings,
  onStealthChange,
  onStatusMessage,
}: Props) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [message, setMessage] = useState("正在准备…");
  const [percent, setPercent] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fastPath, setFastPath] = useState(false);
  const [runtimeKnown, setRuntimeKnown] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const onStealthChangeRef = useRef(onStealthChange);
  const onStatusMessageRef = useRef(onStatusMessage);
  const onBootWorkingRef = useRef(onBootWorking);
  onStealthChangeRef.current = onStealthChange;
  onStatusMessageRef.current = onStatusMessage;
  onBootWorkingRef.current = onBootWorking;

  const setStatus = useCallback((msg: string) => {
    setMessage(msg);
    onStatusMessageRef.current?.(msg);
  }, []);

  const pushLive = useCallback((line: string) => {
    const t = line.trim();
    if (!t) return;
    setLiveLines((prev) => {
      if (prev[prev.length - 1] === t) return prev;
      const next =
        prev.length >= LIVE_CAP ? prev.slice(prev.length - LIVE_CAP + 1) : [...prev];
      next.push(t);
      return next;
    });
  }, []);

  const start = useCallback(
    async (cmd: StartCommand) => {
      setPhase("working");
      setError(null);
      setLiveLines([]);
      setStatus(
        cmd === "restart_harness"
          ? "正在重启官方 UI…"
          : "正在确保 Node / harness 并启动…",
      );
      setStage("detect");
      setPercent(2);
      try {
        const ready = await shellApi.startHarness(cmd);
        setPhase("ready");
        setStage("start");
        setStatus(`服务已就绪 · :${ready.port}`);
        setPercent(100);
        onReady(ready);
      } catch (e) {
        setPhase("error");
        setError(typeof e === "string" ? e : String(e));
        setStatus("启动失败");
        startedRef.current = false;
        onError();
      }
    },
    [onReady, onError, setStatus],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<ProgressPayload>("install-progress", (ev) => {
      const { stage: rawStage, message: msg, percent: pct } = ev.payload;
      pushLive(msg);
      if (isLogOnly(rawStage)) {
        setStage("install-dsh");
        setStatus(msg.length > 120 ? `${msg.slice(0, 119)}…` : msg);
        setPercent((p) => (p != null && p >= 75 ? p : 75));
        return;
      }
      const mapped = mapStage(rawStage);
      if (mapped) setStage(mapped);
      setStatus(msg);
      if (pct != null) {
        setPercent(pct);
      } else if (mapped === "install-dsh" || isHeartbeat(msg)) {
        setPercent((p) => (p != null && p >= 75 ? p : 75));
      }
    }).then((fn) => {
      unlisten = fn;
    });

    void (async () => {
      let coldInstall = true;
      try {
        const st = await shellApi.getRuntimeStatus();
        const ready = st.nodeReady && st.harnessReady;
        const partial = Boolean(st.harnessPartial);
        setFastPath(ready);
        setRepairing(partial && !ready);
        coldInstall = !ready;
        if (ready) {
          setStatus("正在拉起服务…");
          setStage("start");
        } else if (partial) {
          setStatus("检测到不完整 harness，准备修复安装…");
          setStage("install-dsh");
        }
      } catch {
        setFastPath(false);
        coldInstall = true;
      } finally {
        setRuntimeKnown(true);
      }
      onBootWorkingRef.current?.(coldInstall);
      if (!startedRef.current) {
        startedRef.current = true;
        void start(startCommand);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [start, startCommand, pushLive, setStatus]);

  useEffect(() => {
    if (!logOpen) return;
    const el = logBodyRef.current;
    if (!el) return;
    // 等布局后再滚：scrollIntoView 常差一截；直接 scrollTop 更准
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [liveLines, logOpen]);

  const stealth = !runtimeKnown || (fastPath && phase !== "error");

  useEffect(() => {
    onStealthChangeRef.current?.(stealth && phase !== "ready");
    return () => onStealthChangeRef.current?.(false);
  }, [stealth, phase]);

  if (phase === "ready") {
    return null;
  }

  if (stealth) {
    return null;
  }

  const activeIdx = stageIndex(stage);
  const activeLabel = STAGES[activeIdx]?.label ?? "准备";
  const barIndeterminate =
    phase === "working" &&
    (percent == null || percent === 75 || /npm install|修复安装/.test(message));

  return (
    <main className="boot-panel">
      <div className="boot-shell">
        <div className="boot-card">
          <header className="boot-hero">
            <p className="boot-brand">deepseek-harness-desktop</p>
            <div className="boot-hero-row">
              <h1 className="boot-title">
                {repairing ? "修复安装" : "首次准备"}
              </h1>
              {phase === "working" && (
                <span className="boot-hero-meta">
                  {barIndeterminate
                    ? "进行中"
                    : percent != null
                      ? `${percent}%`
                      : null}
                </span>
              )}
            </div>
            <p className="boot-lead">
              {repairing
                ? "上次更新可能中断，正在补全托管 harness 入口后启动。"
                : "安装托管 Node 与 harness 后自动打开官方界面。"}
            </p>
          </header>

          {phase !== "error" && (
            <ol className="boot-steps" aria-label="准备步骤">
              {STAGES.map((s, i) => {
                const state =
                  i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
                return (
                  <li key={s.id} className={`boot-step ${state}`}>
                    {i > 0 && (
                      <span className="boot-step-sep" aria-hidden>
                        /
                      </span>
                    )}
                    <span className="boot-step-label">{s.label}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <section className="boot-status" aria-live="polite">
            <div className="boot-status-head">
              <span className="boot-status-stage">{activeLabel}</span>
              <span className="boot-status-hint">
                {phase === "error" ? "失败" : "实时状态"}
              </span>
            </div>
            <p className="boot-status-line">{message}</p>
            {phase === "working" && (
              <div
                className={`boot-bar${barIndeterminate ? " indeterminate" : ""}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  barIndeterminate ? undefined : (percent ?? undefined)
                }
              >
                <div
                  className="boot-bar-fill"
                  style={
                    barIndeterminate
                      ? undefined
                      : { width: `${percent ?? 0}%` }
                  }
                />
              </div>
            )}
            {error && <pre className="boot-error">{error}</pre>}
            {phase === "error" && (
              <p className="boot-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    startedRef.current = true;
                    onBootWorkingRef.current?.(true);
                    void start(startCommand);
                  }}
                >
                  重试
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={onOpenSettings}
                >
                  去设置网络
                </button>
              </p>
            )}
          </section>

          <section className="boot-log">
            <button
              type="button"
              className="boot-log-toggle"
              aria-expanded={logOpen}
              onClick={() => setLogOpen((v) => !v)}
            >
              <span className="boot-log-title">过程日志</span>
              <span className="boot-log-meta">
                {liveLines.length} 行 · {logOpen ? "收起" : "展开"}
              </span>
            </button>
            {logOpen && (
              <div
                ref={logBodyRef}
                className="boot-log-body"
                aria-label="过程日志"
              >
                {liveLines.length === 0 ? (
                  <div className="boot-log-empty">等待进度…</div>
                ) : (
                  liveLines.map((line, i) => (
                    <div
                      key={`${i}-${line.slice(0, 20)}`}
                      className="boot-log-line"
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
