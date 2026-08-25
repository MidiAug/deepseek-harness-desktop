/**
 * 冷启动 UI：Capability 不足 → 安装大卡；否则极简状态面（icon + 文案）。
 * 进度订阅 HostLifecycle；本地只保留错误与表面分流。
 */
import {
  BOOT_STAGES,
  stageIndex,
  useBootPanel,
  type ReadyPayload,
  type StartCommand,
} from "../../shell";
import { FaultRecoveryBlock } from "../chrome/FaultRecoveryBlock";
import { HarnessRecoveryDialogs } from "../chrome/HarnessRecoveryDialogs";
import { BootPanelLog } from "./BootPanelLog";
import { BootPanelSteps } from "./BootPanelSteps";
import { SessionStatusSurface } from "./SessionStatusSurface";

type Props = {
  startCommand: StartCommand;
  /** false：用户主动停止后挂载，禁止自动 ensure */
  autoStart?: boolean;
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

export function BootPanel(props: Props) {
  const panel = useBootPanel(props);
  const {
    t,
    recovery,
    logBodyRef,
    repairing,
    logOpen,
    setLogOpen,
    showFault,
    error,
    installMode,
    runCta,
    stealth,
    working,
    embedding,
    awaitingManualStart,
    startManual,
    message,
    percent,
    stageId,
    logLines,
    barIndeterminate,
    surfaceMode,
  } = panel;

  const activeIdx = stageIndex(stageId);
  const activeLabel = t(
    BOOT_STAGES[activeIdx]?.labelKey ?? "boot.stage.prepare",
  );
  const confirmDialogs = <HarnessRecoveryDialogs dialogs={recovery.dialogs} />;

  if (stealth) {
    return confirmDialogs;
  }

  if (surfaceMode === "status") {
    return (
      <>
        {confirmDialogs}
        <SessionStatusSurface
          message={
            embedding
              ? t("boot.msg.embedding")
              : awaitingManualStart
                ? t("boot.msg.stopped")
                : message
          }
          awaitingManualStart={awaitingManualStart}
          startLabel={t("boot.cta.startManual")}
          onStartManual={startManual}
        >
          {showFault && error ? (
            <FaultRecoveryBlock
              error={error}
              installMode={installMode}
              onCta={runCta}
            />
          ) : null}
        </SessionStatusSurface>
      </>
    );
  }

  return (
    <main className="boot-panel">
      {confirmDialogs}
      <div className="boot-shell">
        <div
          className={`boot-card${showFault || awaitingManualStart ? " boot-card--failed" : ""}`}
        >
          {!showFault && !awaitingManualStart && !embedding && (
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

          {!showFault && !awaitingManualStart && !embedding && (
            <BootPanelSteps stageId={stageId} t={t} />
          )}

          {showFault && error ? (
            <FaultRecoveryBlock
              error={error}
              installMode={installMode}
              onCta={runCta}
            />
          ) : awaitingManualStart ? (
            <section className="boot-status" aria-live="polite">
              <p className="boot-status-line">{t("boot.msg.stopped")}</p>
              <button
                type="button"
                className="btn"
                onClick={() => startManual()}
              >
                {t("boot.cta.startManual")}
              </button>
            </section>
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

          <BootPanelLog
            logOpen={logOpen}
            setLogOpen={setLogOpen}
            logLines={logLines}
            logBodyRef={logBodyRef}
            t={t}
          />
        </div>
      </div>
    </main>
  );
}
