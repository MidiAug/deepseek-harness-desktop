import { useEffect, useRef, useState } from "react";
import {
  shellApi,
  shellLog,
  useHarnessSettingsOps,
  useHostLifecycle,
  useShellUpdate,
  type RuntimeStatus,
} from "../../shell";
import { useLocale } from "../../shell/locale";

type Props = {
  runtime: RuntimeStatus | null;
  onDiagnosticsExported?: (path: string) => void;
  onDiagnosticsError?: (
    message: string,
    retry?: () => void | Promise<void>,
  ) => void;
};

/** 关于分区：harness 运维 + 进度/日志；自消费 HarnessSettingsOpsProvider。 */
export function SettingsSectionAbout({
  runtime,
  onDiagnosticsExported,
  onDiagnosticsError,
}: Props) {
  const { t } = useLocale();
  const life = useHostLifecycle();
  const shellUpd = useShellUpdate();
  const {
    updateCheck,
    onCheckUpdate,
    onApplyUpdate,
    onApplyNetworkRestart,
  } = useHarnessSettingsOps();
  const [exporting, setExporting] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const locked = life.locked;
  const showProgress = locked || life.logLines.length > 0;
  const barIndeterminate =
    locked && (life.percent == null || life.percent === 75);

  useEffect(() => {
    if (life.logLines.length === 0) return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [life.logLines]);

  async function onExportDiagnostics() {
    if (exporting || locked) return;
    const run = async () => {
      setExporting(true);
      try {
        const result = await shellApi.exportDiagnostics();
        onDiagnosticsExported?.(result.path);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        onDiagnosticsError?.(msg, run);
      } finally {
        setExporting(false);
      }
    };
    await run();
  }

  return (
    <div className="settings-section settings-about">
      <div className="settings-about-card">
        <div className="settings-about-brand">
          <span className="settings-about-name">{t("settings.about.name")}</span>
          <span className="settings-about-tag">{t("settings.about.tag")}</span>
        </div>
        <dl className="settings-about-meta">
          <div>
            <dt>{t("settings.about.shellVersion")}</dt>
            <dd>{runtime?.shellVersion ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("settings.about.harness")}</dt>
            <dd>
              <span className="settings-about-ver">
                {runtime?.harnessVersion ??
                  (locked ? t("settings.about.installing") : t("settings.about.notInstalled"))}
              </span>
              {runtime?.harnessReady ? (
                <span className="settings-pill ok">{t("settings.about.ready")}</span>
              ) : locked ? (
                <span className="settings-pill warn">{t("settings.about.installing")}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{t("settings.about.digest")}</dt>
            <dd className="mono">{runtime?.harnessDigest ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("settings.about.port")}</dt>
            <dd>{runtime?.port ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("settings.about.node")}</dt>
            <dd>
              {runtime?.nodeReady ? (
                <span className="settings-pill ok">{t("settings.about.ready")}</span>
              ) : (
                <span className="settings-pill warn">{t("settings.about.nodeMissing")}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="settings-cell-actions">
        <button
          type="button"
          className="btn ghost"
          disabled={locked || exporting}
          onClick={() => void onExportDiagnostics()}
        >
          {t("settings.about.exportDiagnostics")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void shellApi.openPlatformWindow().catch((e) => shellLog.error("about", "open platform", e));
          }}
        >
          {t("settings.about.openPlatform")}
        </button>
      </div>
      <p className="settings-live-hint">{t("settings.about.platformHint")}</p>

      {updateCheck && !locked && (
        <div
          className={`settings-update-banner${updateCheck.updateAvailable ? " has-update" : ""}`}
        >
          <span>
            {updateCheck.local ?? t("settings.about.notInstalled")}
            {updateCheck.latest ? ` · registry ${updateCheck.latest}` : ""}
          </span>
          <span className="settings-update-banner-flag">
            {updateCheck.updateAvailable
              ? t("settings.about.updateFound")
              : t("settings.about.upToDate")}
          </span>
        </div>
      )}

      {showProgress && (
        <div
          className="settings-progress-panel"
          role="status"
          aria-live="polite"
        >
          <div className="settings-progress-head">
            <span className="settings-progress-msg">
              {life.message ||
                (locked
                  ? t("settings.about.progress.busy")
                  : t("settings.about.progress.idle"))}
            </span>
            {life.percent != null && !barIndeterminate && (
              <span className="settings-progress-pct">{life.percent}%</span>
            )}
          </div>
          <div
            className={`settings-progress-bar${barIndeterminate ? " indeterminate" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              barIndeterminate ? undefined : (life.percent ?? undefined)
            }
          >
            <div
              className="settings-progress-fill"
              style={
                barIndeterminate
                  ? undefined
                  : { width: `${life.percent ?? 0}%` }
              }
            />
          </div>
          {life.logLines.length > 0 && (
            <div className="settings-log" aria-label="log">
              {life.logLines.map((line, i) => (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className="settings-log-line"
                >
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {!locked && (
        <div className="settings-cell-actions">
          <button type="button" className="btn" onClick={() => void onCheckUpdate()}>
            {t("settings.about.checkUpdate")}
          </button>
          {updateCheck?.updateAvailable && (
            <button
              type="button"
              className="btn primary"
              onClick={() => void onApplyUpdate()}
            >
              {t("settings.about.applyUpdate")}
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => void onApplyNetworkRestart()}
          >
            {t("settings.about.applyNetwork")}
          </button>
        </div>
      )}

      <p className="settings-live-hint">
        {shellUpd.phase === "downloaded"
          ? t("settings.about.shellUpdate.downloaded", {
              version: shellUpd.version ?? "",
            })
          : shellUpd.phase === "downloading"
            ? `${t("settings.about.shellUpdate.downloading")}${shellUpd.percent != null ? ` ${shellUpd.percent}%` : "…"}`
            : shellUpd.phase === "unsupported"
              ? t("settings.about.shellUpdate.unsupported")
              : t("settings.about.shellUpdate.idle")}
      </p>
      <p className="settings-live-hint settings-live-hint-subtle">
        {t("settings.about.shellUpdate.safeHint")}
      </p>
      <div className="settings-cell-actions">
        <button
          type="button"
          className="btn ghost"
          disabled={
            shellUpd.phase === "checking" ||
            shellUpd.phase === "downloading" ||
            shellUpd.phase === "installing"
          }
          onClick={() => void shellUpd.checkNow(true)}
        >
          {t("settings.about.shellUpdate.check")}
        </button>
        {shellUpd.phase === "downloaded" && (
          <button
            type="button"
            className="btn primary"
            onClick={() => void shellUpd.installAndRelaunch()}
          >
            {t("settings.about.shellUpdate.install")}
          </button>
        )}
      </div>
    </div>
  );
}
