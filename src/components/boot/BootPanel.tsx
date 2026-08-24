import { useCallback, useEffect, useRef, useState } from "react";
import {
  BOOT_STAGES,
  shellApi,
  shellLog,
  stageIndex,
  useHostLifecycle,
  useLocale,
  type ReadyPayload,
  type StartCommand,
} from "../../shell";
import { type FaultCta } from "../../shell/errors/recoveryMatrix";
import {
  resolveInstallMode,
  type InstallMode,
} from "../../shell/runtime/installMode";
import { FaultRecoveryBlock } from "../chrome/FaultRecoveryBlock";
import { ShellConfirmDialog } from "../chrome/ShellConfirmDialog";

type Props = {
  startCommand: StartCommand;
  forceStealth?: boolean;
  embedding?: boolean;
  sessionError?: string | null;
  onReady: (payload: ReadyPayload) => void;
  onError: (message: string) => void;
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
  forceStealth = false,
  embedding = false,
  sessionError = null,
  onReady,
  onError,
  onBootWorking,
  onOpenSettings,
  onStealthChange,
  onStatusMessage,
}: Props) {
  const life = useHostLifecycle();
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fastPath, setFastPath] = useState(false);
  const [runtimeKnown, setRuntimeKnown] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [cleanProfileConfirmOpen, setCleanProfileConfirmOpen] = useState(false);
  const [resetConfigConfirmOpen, setResetConfigConfirmOpen] = useState(false);
  const [reinstallConfirmOpen, setReinstallConfirmOpen] = useState(false);
  const [resetConfigBusy, setResetConfigBusy] = useState(false);
  const [reinstallBusy, setReinstallBusy] = useState(false);
  const [dshHomePath, setDshHomePath] = useState("");
  const [slowBoot, setSlowBoot] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>("hosted");
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

  const setStatus = useCallback(
    (
      msg: string,
      stageId?: Parameters<typeof life.seedBoot>[0]["stageId"],
      percent?: number | null,
    ) => {
      seedBootRef.current({
        message: msg,
        stageId,
        percent,
      });
      onStatusMessageRef.current?.(msg);
    },
    [],
  );

  const executeReinstallDsh = useCallback(() => {
    startedRef.current = true;
    onBootWorkingRef.current?.(true);
    setFailed(false);
    setError(null);
    setReinstallBusy(true);
    seedBootRef.current({
      message: t("boot.msg.reinstalling"),
      stageId: "detect",
      percent: 5,
      clearLog: true,
    });
    void (async () => {
      try {
        const ready = await shellApi.reinstallDsh();
        setReinstallConfirmOpen(false);
        seedBootRef.current({
          message: t("boot.msg.embedding"),
          stageId: "start",
          percent: null,
        });
        onReady(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", "reinstall_dsh", msg);
        setFailed(true);
        setError(msg);
        seedBootRef.current({
          message: t("boot.msg.reinstallFailed"),
          stageId: "start",
        });
        startedRef.current = false;
        onError(msg);
      } finally {
        setReinstallBusy(false);
      }
    })();
  }, [onReady, onError, t]);

  const executeResetConfig = useCallback(() => {
    startedRef.current = true;
    onBootWorkingRef.current?.(true);
    setFailed(false);
    setError(null);
    setResetConfigBusy(true);
    life.beginOps(t("boot.msg.resettingConfig"));
    seedBootRef.current({
      message: t("boot.msg.resettingConfig"),
      stageId: "detect",
      percent: 5,
      clearLog: true,
    });
    void (async () => {
      try {
        const ready = await shellApi.resetDshHome();
        setResetConfigConfirmOpen(false);
        onReady(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", "reset_dsh_home", msg);
        setFailed(true);
        setError(msg);
        seedBootRef.current({
          message: t("boot.msg.resetConfigFailed"),
          stageId: "start",
        });
        startedRef.current = false;
        onError(msg);
      } finally {
        setResetConfigBusy(false);
        life.endOps({ clearProgress: true });
      }
    })();
  }, [life, onReady, onError, t]);

  const executeCleanProfile = useCallback(() => {
    startedRef.current = true;
    onBootWorkingRef.current?.(true);
    setFailed(false);
    setError(null);
    seedBootRef.current({
      message: t("boot.msg.ensure"),
      stageId: "detect",
      percent: 5,
      clearLog: true,
    });
    void (async () => {
      try {
        const ready = await shellApi.startCleanProfile();
        seedBootRef.current({
          message: t("boot.msg.embedding"),
          stageId: "start",
          percent: null,
        });
        onReady(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", "start_clean_profile", msg);
        setFailed(true);
        setError(msg);
        seedBootRef.current({
          message: t("boot.msg.failed"),
          stageId: "start",
        });
        startedRef.current = false;
        onError(msg);
      }
    })();
  }, [onReady, onError, t]);

  const runCleanProfile = useCallback(() => {
    setCleanProfileConfirmOpen(true);
  }, []);

  const start = useCallback(
    async (cmd: StartCommand) => {
      setFailed(false);
      setError(null);
      const msg =
        cmd === "restart_harness" ? t("boot.msg.restart") : t("boot.msg.ensure");
      seedBootRef.current({
        message: msg,
        stageId: "detect",
        percent: 2,
        clearLog: true,
      });
      onStatusMessageRef.current?.(msg);
      try {
        const ready = await shellApi.startHarness(cmd);
        const readyMsg = t("boot.msg.embedding");
        seedBootRef.current({
          message: readyMsg,
          stageId: "start",
          percent: null,
        });
        onStatusMessageRef.current?.(readyMsg);
        onReady(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", `startHarness ${cmd}`, msg);
        setFailed(true);
        setError(msg);
        seedBootRef.current({ message: t("boot.msg.failed"), stageId: "start" });
        onStatusMessageRef.current?.(t("boot.msg.failed"));
        startedRef.current = false;
        onError(msg);
      }
    },
    [onReady, onError, t],
  );

  const runCta = useCallback(
    (cta: FaultCta) => {
      switch (cta) {
        case "retry":
          startedRef.current = true;
          onBootWorkingRef.current?.(true);
          void start(startCommand);
          break;
        case "network":
          onOpenSettings();
          break;
        case "logs":
          void shellApi.openKnownPath("logs");
          break;
        case "resetConfig":
          setResetConfigConfirmOpen(true);
          break;
        case "reinstallDsh":
          setReinstallConfirmOpen(true);
          break;
        case "cleanProfile":
          runCleanProfile();
          break;
      }
    },
    [onOpenSettings, runCleanProfile, start, startCommand],
  );

  useEffect(() => {
    void (async () => {
      let coldInstall = true;
      try {
        const st = await shellApi.getRuntimeStatus();
        setInstallMode(
          resolveInstallMode({
            runtimeSource: st.runtimeSource,
            activeRuntime: st.activeRuntime,
          }),
        );
        setDshHomePath(st.dshHome ?? st.effectiveDshHome ?? "");
        const ready = st.nodeReady && st.harnessReady;
        const partial = Boolean(st.harnessPartial);
        setFastPath(ready);
        setRepairing(partial && !ready);
        coldInstall = !ready;
        if (ready) {
          setStatus(t("boot.msg.ensure"), "start");
        } else if (partial) {
          setStatus(t("boot.lead.repair"), "install-dsh");
        }
      } catch {
        setFastPath(false);
        coldInstall = true;
      } finally {
        setRuntimeKnown(true);
      }
      onBootWorkingRef.current?.(coldInstall);
      if (startCommand === "external_op") {
        setRuntimeKnown(true);
        return;
      }
      if (!startedRef.current) {
        startedRef.current = true;
        void start(startCommand);
      }
    })();
  }, [start, startCommand, setStatus, t]);

  useEffect(() => {
    if (!logOpen) return;
    const el = logBodyRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [life.logLines, logOpen]);

  useEffect(() => {
    if (!sessionError) return;
    setFailed(true);
    setError(sessionError);
  }, [sessionError]);

  const showFault = failed && !!error;
  const stealth =
    forceStealth ||
    !runtimeKnown ||
    (fastPath && !showFault && !slowBoot && !embedding);
  const working = !showFault && !embedding;

  useEffect(() => {
    if (forceStealth || !working || showFault) {
      setSlowBoot(false);
      return;
    }
    const id = window.setTimeout(() => setSlowBoot(true), 1800);
    return () => window.clearTimeout(id);
  }, [working, showFault, forceStealth]);

  useEffect(() => {
    onStealthChangeRef.current?.(stealth);
    return () => onStealthChangeRef.current?.(false);
  }, [stealth]);

  const { message, percent, stageId, logLines } = life;
  const activeIdx = stageIndex(stageId);
  const activeLabel = t(
    BOOT_STAGES[activeIdx]?.labelKey ?? "boot.stage.prepare",
  );
  const barIndeterminate =
    working &&
    (percent == null || percent === 75 || /npm install|修复安装/.test(message));

  const confirmDialogs = (
    <>
      <ShellConfirmDialog
        open={cleanProfileConfirmOpen}
        titleKey="boot.cleanProfile.confirmTitle"
        bodyKey="boot.cleanProfile.confirm"
        onCancel={() => setCleanProfileConfirmOpen(false)}
        onConfirm={() => {
          setCleanProfileConfirmOpen(false);
          executeCleanProfile();
        }}
      />
      <ShellConfirmDialog
        open={resetConfigConfirmOpen}
        titleKey="boot.resetConfig.confirmTitle"
        bodyKey="boot.resetConfig.confirm"
        bodyParams={{ path: dshHomePath || "—" }}
        busy={resetConfigBusy}
        onCancel={() => {
          if (!resetConfigBusy) setResetConfigConfirmOpen(false);
        }}
        onConfirm={executeResetConfig}
      />
      <ShellConfirmDialog
        open={reinstallConfirmOpen}
        titleKey="boot.reinstallDsh.confirmTitle"
        bodyKey={
          installMode === "system"
            ? "boot.reinstallDsh.confirmSystem"
            : "boot.reinstallDsh.confirmHosted"
        }
        busy={reinstallBusy}
        onCancel={() => {
          if (!reinstallBusy) setReinstallConfirmOpen(false);
        }}
        onConfirm={executeReinstallDsh}
      />
    </>
  );

  if (stealth) {
    return confirmDialogs;
  }

  return (
    <main className="boot-panel">
      {confirmDialogs}
      <div className="boot-shell">
        <div className={`boot-card${showFault ? " boot-card--failed" : ""}`}>
          {!showFault && !embedding && (
            <header className="boot-hero">
              <div className="boot-hero-row">
                <h1 className="boot-title">
                  {repairing ? t("boot.title.repair") : t("boot.title.firstRun")}
                </h1>
                {working && (
                  <span className="boot-hero-meta">
                    {barIndeterminate
                      ? t("boot.status.working")
                      : percent != null
                        ? `${percent}%`
                        : null}
                  </span>
                )}
              </div>
              <p className="boot-lead">
                {repairing ? t("boot.lead.repair") : t("boot.lead.firstRun")}
              </p>
            </header>
          )}

          {!showFault && !embedding && (
            <ol className="boot-steps" aria-label={t("boot.steps")}>
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
                    <span className="boot-step-label">{t(s.labelKey)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {showFault && error ? (
            <FaultRecoveryBlock
              error={error}
              installMode={installMode}
              onCta={runCta}
            />
          ) : (
            <section className="boot-status" aria-live="polite">
              <div className="boot-status-head">
                <span className="boot-status-stage">
                  {embedding ? t("boot.stage.start") : activeLabel}
                </span>
                <span className="boot-status-hint">
                  {embedding ? t("boot.status.working") : t("boot.status.live")}
                </span>
              </div>
              <p className="boot-status-line">
                {embedding ? t("boot.msg.embedding") : message}
              </p>
              {(working || embedding) && (
                <div
                  className={`boot-bar${barIndeterminate || embedding ? " indeterminate" : ""}`}
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
            </section>
          )}

          <section className="boot-log">
            <button
              type="button"
              className="boot-log-toggle"
              aria-expanded={logOpen}
              onClick={() => setLogOpen((v) => !v)}
            >
              <span className="boot-log-title">{t("boot.log.title")}</span>
              <span className="boot-log-meta">
                {t("boot.log.lineCount", { n: String(logLines.length) })}
                {logOpen ? t("boot.log.collapse") : t("boot.log.expand")}
              </span>
            </button>
            {logOpen && (
              <div
                ref={logBodyRef}
                className="boot-log-body"
                aria-label={t("boot.log.title")}
              >
                {logLines.length === 0 ? (
                  <div className="boot-log-empty">{t("boot.log.wait")}</div>
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
