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
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  runtime: RuntimeStatus | null;
};

/** 关于与更新：身份只读 + 更新 PrefRow；忙时进度条 + 启动日志组。 */
export function SettingsSectionAbout({ runtime }: Props) {
  const { t } = useLocale();
  const life = useHostLifecycle();
  const shellUpd = useShellUpdate();
  const {
    updateCheck,
    checkingUpdate,
    onCheckUpdate,
    onApplyUpdate,
  } = useHarnessSettingsOps();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [identityAdvanced, setIdentityAdvanced] = useState(false);

  const locked = life.locked;
  const hasLog = life.logLines.length > 0;
  const barIndeterminate =
    locked && (life.percent == null || life.percent === 75);

  const shellChecking =
    shellUpd.phase === "checking" ||
    shellUpd.phase === "downloading" ||
    shellUpd.phase === "installing";

  // PrefRow 次文：只允许短句，长说明不进行内
  const shellDesc =
    shellUpd.phase === "downloaded"
      ? t("settings.about.shellUpdate.downloaded", {
          version: shellUpd.version ?? "",
        })
      : shellUpd.phase === "downloading"
        ? `${t("settings.about.shellUpdate.downloading")}${shellUpd.percent != null ? ` ${shellUpd.percent}%` : "…"}`
        : shellUpd.phase === "checking"
          ? t("settings.hint.checkingUpdate")
          : shellUpd.phase === "unsupported"
            ? t("settings.about.shellUpdate.descDev")
            : shellUpd.phase === "upToDate"
              ? t("settings.about.upToDate")
              : t("settings.about.shellUpdate.descAuto");

  const harnessDesc = checkingUpdate
    ? t("settings.hint.checkingUpdate")
    : updateCheck?.updateAvailable
      ? `${t("settings.about.updateFound")} ${updateCheck.latest ?? "?"}`
      : updateCheck
        ? t("settings.about.upToDate")
        : t("settings.about.harnessUpdate.descIdle");

  useEffect(() => {
    if (life.logLines.length === 0) return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [life.logLines]);

  function copyLog() {
    const text = life.logLines.join("\n");
    if (!text) return;
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }

  return (
    <div className="settings-section settings-about">
      <SettingsGroup title={t("settings.group.identity")}>
        <div className="settings-about-identity">
          <div className="settings-about-brand">
            <span className="settings-about-name">
              {t("settings.about.name")}
            </span>
            <span className="settings-about-tag">
              {t("settings.about.tag")}
            </span>
          </div>
          <dl className="settings-about-meta">
            <div>
              <dt>{t("settings.about.shellVersion")}</dt>
              <dd className="shell-copyable">
                {runtime?.shellVersion ?? "—"}
              </dd>
            </div>
            <div>
              <dt>{t("settings.about.harness")}</dt>
              <dd>
                <span className="settings-about-ver shell-copyable">
                  {runtime?.harnessVersion ??
                    (locked
                      ? t("settings.about.installing")
                      : t("settings.about.notInstalled"))}
                </span>
                {runtime?.harnessReady ? (
                  <span className="settings-pill ok">
                    {t("settings.about.ready")}
                  </span>
                ) : locked ? (
                  <span className="settings-pill warn">
                    {t("settings.about.installing")}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
          <div className="settings-about-advanced-head">
            <button
              type="button"
              className="settings-about-advanced-toggle"
              aria-expanded={identityAdvanced}
              onClick={() => setIdentityAdvanced((v) => !v)}
            >
              <span className="settings-about-advanced-label">
                {t("settings.about.identityAdvanced")}
              </span>
              <span className="settings-disclosure-marker" aria-hidden>
                {identityAdvanced ? "▾" : "▸"}
              </span>
            </button>
          </div>
          {identityAdvanced && (
            <dl className="settings-about-meta settings-about-meta-advanced">
              <div>
                <dt>{t("settings.about.digest")}</dt>
                <dd className="mono">{runtime?.harnessDigest ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("settings.about.port")}</dt>
                <dd className="mono">{runtime?.port ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("settings.about.node")}</dt>
                <dd>
                  {runtime?.nodeReady ? (
                    <span className="settings-pill ok">
                      {t("settings.about.ready")}
                    </span>
                  ) : (
                    <span className="settings-pill warn">
                      {t("settings.about.nodeMissing")}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.updates")}>
        <SettingsPrefRow
          title={t("settings.about.shellUpdate.rowTitle")}
          description={shellDesc}
        >
          <div className="settings-cell-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={shellChecking || shellUpd.phase === "unsupported"}
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
        </SettingsPrefRow>
        <SettingsPrefRow
          title={t("settings.about.harnessUpdate.rowTitle")}
          description={harnessDesc}
          disabled={locked}
        >
          <div className="settings-cell-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={locked || checkingUpdate}
              onClick={() => void onCheckUpdate()}
            >
              {t("settings.about.checkUpdate")}
            </button>
            {!locked && updateCheck?.updateAvailable && (
              <button
                type="button"
                className="btn primary"
                onClick={() => void onApplyUpdate()}
              >
                {t("settings.about.applyUpdate")}
              </button>
            )}
          </div>
        </SettingsPrefRow>
        {locked && (
          <div
            className="settings-ops-progress"
            role="status"
            aria-live="polite"
          >
            <div className="settings-progress-head">
              <span className="settings-progress-msg">
                {life.message || t("settings.about.progress.busy")}
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
          </div>
        )}
        <p className="settings-live-hint settings-live-hint-subtle settings-about-safe-hint">
          {t("settings.about.shellUpdate.safeHint")}
        </p>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.links")}>
        <SettingsPrefRow
          title={t("settings.about.openPlatform")}
          description={t("settings.about.platformHint")}
        >
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              void shellApi
                .openPlatformWindow()
                .catch((e) => shellLog.error("about", "open platform", e));
            }}
          >
            {t("settings.about.openPlatform")}
          </button>
        </SettingsPrefRow>
      </SettingsGroup>

      {hasLog && (
        <SettingsGroup title={t("settings.about.viewLogs")}>
          <div className="settings-ops-log-body">
            <div className="settings-cell-actions">
              <button type="button" className="btn ghost" onClick={copyLog}>
                {t("settings.about.copyLog")}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  void shellApi
                    .openKnownPath("logs")
                    .catch((e) => shellLog.error("about", "open logs", e));
                }}
              >
                {t("settings.about.openLogsDir")}
              </button>
            </div>
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
          </div>
        </SettingsGroup>
      )}
    </div>
  );
}
