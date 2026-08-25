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

/** 冷启动 UI：进度/日志订阅 HostLifecycle；本地只保留错误与 stealth。 */
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
    message,
    percent,
    stageId,
    logLines,
    barIndeterminate,
  } = panel;

  const activeIdx = stageIndex(stageId);
  const activeLabel = t(
    BOOT_STAGES[activeIdx]?.labelKey ?? "boot.stage.prepare",
  );
  const confirmDialogs = <HarnessRecoveryDialogs dialogs={recovery.dialogs} />;

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
            <BootPanelSteps stageId={stageId} t={t} />
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
