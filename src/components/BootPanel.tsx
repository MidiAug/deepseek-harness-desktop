import { useCallback, useEffect, useRef, useState } from "react";
import {
  BOOT_STAGES,
  shellApi,
  stageIndex,
  useHostLifecycle,
  type ReadyPayload,
  type StartCommand,
} from "../shell";

type Props = {
  startCommand: StartCommand;
  onReady: (payload: ReadyPayload) => void;
  onError: () => void;
  onBootWorking?: (coldInstall: boolean) => void;
  onOpenSettings: () => void;
  onStealthChange?: (stealth: boolean) => void;
  onStatusMessage?: (message: string) => void;
};

/**
 * 冷启动 UI：进度/日志订阅 HostLifecycle；本地只保留错误与 stealth。
 */
export function BootPanel({
  startCommand,
  onReady,
  onError,
  onBootWorking,
  onOpenSettings,
  onStealthChange,
  onStatusMessage,
}: Props) {
  const life = useHostLifecycle();
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fastPath, setFastPath] = useState(false);
  const [runtimeKnown, setRuntimeKnown] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [done, setDone] = useState(false);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const onStealthChangeRef = useRef(onStealthChange);
  const onStatusMessageRef = useRef(onStatusMessage);
  const onBootWorkingRef = useRef(onBootWorking);
  const seedBootRef = useRef(life.seedBoot);
  onStealthChangeRef.current = onStealthChange;
  onStatusMessageRef.current = onStatusMessage;
  onBootWorkingRef.current = onBootWorking;
  seedBootRef.current = life.seedBoot;

  const setStatus = useCallback((msg: string, stageId?: Parameters<typeof life.seedBoot>[0]["stageId"], percent?: number | null) => {
    seedBootRef.current({
      message: msg,
      stageId,
      percent,
    });
    onStatusMessageRef.current?.(msg);
  }, []);

  const start = useCallback(
    async (cmd: StartCommand) => {
      setFailed(false);
      setError(null);
      setDone(false);
      const msg =
        cmd === "restart_harness"
          ? "正在重启官方 UI…"
          : "正在确保 Node / harness 并启动…";
      seedBootRef.current({
        message: msg,
        stageId: "detect",
        percent: 2,
        clearLog: true,
      });
      onStatusMessageRef.current?.(msg);
      try {
        const ready = await shellApi.startHarness(cmd);
        seedBootRef.current({
          message: `服务已就绪 · :${ready.port}`,
          stageId: "start",
          percent: 100,
        });
        onStatusMessageRef.current?.(`服务已就绪 · :${ready.port}`);
        setDone(true);
        onReady(ready);
      } catch (e) {
        setFailed(true);
        setError(typeof e === "string" ? e : String(e));
        seedBootRef.current({ message: "启动失败", stageId: "start" });
        onStatusMessageRef.current?.("启动失败");
        startedRef.current = false;
        onError();
      }
    },
    [onReady, onError],
  );

  useEffect(() => {
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
          setStatus("正在拉起服务…", "start");
        } else if (partial) {
          setStatus("检测到不完整 harness，准备修复安装…", "install-dsh");
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
  }, [start, startCommand, setStatus]);

  useEffect(() => {
    if (!logOpen) return;
    const el = logBodyRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [life.logLines, logOpen]);

  const stealth = !runtimeKnown || (fastPath && !failed);
  const working = !failed && !done;

  useEffect(() => {
    onStealthChangeRef.current?.(stealth && !done);
    return () => onStealthChangeRef.current?.(false);
  }, [stealth, done]);

  if (done) {
    return null;
  }

  if (stealth) {
    return null;
  }

  const { message, percent, stageId, logLines } = life;
  const activeIdx = stageIndex(stageId);
  const activeLabel = BOOT_STAGES[activeIdx]?.label ?? "准备";
  const barIndeterminate =
    working &&
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
              {working && (
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

          {!failed && (
            <ol className="boot-steps" aria-label="准备步骤">
              {BOOT_STAGES.map((s, i) => {
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
                {failed ? "失败" : "实时状态"}
              </span>
            </div>
            <p className="boot-status-line">{message}</p>
            {working && (
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
            {failed && (
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
                {logLines.length} 行 · {logOpen ? "收起" : "展开"}
              </span>
            </button>
            {logOpen && (
              <div
                ref={logBodyRef}
                className="boot-log-body"
                aria-label="过程日志"
              >
                {logLines.length === 0 ? (
                  <div className="boot-log-empty">等待进度…</div>
                ) : (
                  logLines.map((line, i) => (
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
