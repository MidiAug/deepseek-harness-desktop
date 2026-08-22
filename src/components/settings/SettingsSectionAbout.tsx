import type { RefObject } from "react";
import {
  shellApi,
  type HarnessUpdateCheck,
  type RuntimeStatus,
  type ShellUpdateState,
} from "../../shell";
import { useLocale } from "../../shell/locale";

type LifeSlice = {
  message: string;
  percent: number | null;
  logLines: string[];
};

type ShellUpdSlice = Pick<
  ShellUpdateState,
  "phase" | "version" | "percent"
> & {
  checkNow: (force?: boolean) => void | Promise<void>;
  installAndRelaunch: () => void | Promise<void>;
};

type Props = {
  runtime: RuntimeStatus | null;
  locked: boolean;
  showProgress: boolean;
  barIndeterminate: boolean;
  life: LifeSlice;
  logEndRef: RefObject<HTMLDivElement | null>;
  updateCheck: HarnessUpdateCheck | null;
  shellUpd: ShellUpdSlice;
  onCheckUpdate: () => void | Promise<void>;
  onApplyUpdate: () => void | Promise<void>;
  onApplyNetworkRestart: () => void | Promise<void>;
};

export function SettingsSectionAbout({
  runtime,
  locked,
  showProgress,
  barIndeterminate,
  life,
  logEndRef,
  updateCheck,
  shellUpd,
  onCheckUpdate,
  onApplyUpdate,
  onApplyNetworkRestart,
}: Props) {
  const { t } = useLocale();

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
          className="btn"
          onClick={() => {
            void shellApi.openPlatformWindow().catch((e) => console.error(e));
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
