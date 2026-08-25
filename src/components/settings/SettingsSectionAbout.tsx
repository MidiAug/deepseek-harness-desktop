import { useEffect, useRef, useState } from "react";
import {
  shellApi,
  shellLog,
  useHarnessSettingsOps,
  useHostLifecycle,
  useShellUpdate,
  useAppToast,
  useSettingsPanelContext,
  runtimeFromSettings,
  normalizeShellSettings,
} from "../../shell";
import { resolveInstallMode } from "../../shell/runtime/installMode";
import { useLocale } from "../../shell/locale";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { SettingsUpdateRow } from "./SettingsUpdateRow";
import { SettingsUpdateNotice } from "./SettingsUpdateNotice";
import { SettingsUpdateProgress } from "./SettingsUpdateProgress";
import { parseFaultDisplay, CTA_LABEL_KEYS } from "../../shell/errors";
import type { RuntimeStatus } from "../../shell";

function harnessVersionLabel(
  runtime: RuntimeStatus | null,
  locked: boolean,
  t: (key: import("../../shell/locale").LocaleKey) => string,
): string {
  if (runtime?.harnessVersion) return runtime.harnessVersion;
  if (runtime?.harnessReady) return t("settings.about.harnessRunning");
  if (locked) return t("settings.about.installing");
  return t("settings.about.notInstalled");
}

/** 关于与更新：身份只读 + 内联更新行（进度/错误不沉底）。 */
export function SettingsSectionAbout() {
  const { runtime, fault, onFaultCta } = useSettingsPanelContext();
  const { t } = useLocale();
  const { showToast } = useAppToast();
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
  const opsActive = life.busyReason === "ops";
  const hasLog = life.logLines.length > 0;

  const installMode = resolveInstallMode({
    runtimeSource: runtime?.runtimeSource,
    activeRuntime: runtime?.activeRuntime,
  });

  const shellChecking =
    shellUpd.phase === "checking" ||
    shellUpd.phase === "downloading" ||
    shellUpd.phase === "installing";

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

  const localHarnessVersion =
    updateCheck?.local ??
    runtime?.harnessVersion ??
    null;

  const harnessVersionLine =
    updateCheck?.updateAvailable
      ? t("settings.about.harnessUpdate.available", {
          latest: updateCheck.latest ?? "?",
          local: localHarnessVersion ?? t("settings.about.unknownVersion"),
        })
      : updateCheck
        ? t("settings.about.upToDate")
        : localHarnessVersion
          ? t("settings.about.harnessUpdate.current", {
              local: localHarnessVersion,
            })
          : t("settings.about.harnessUpdate.descIdle");

  const harnessDesc = opsActive
    ? life.message || t("settings.about.progress.busy")
    : checkingUpdate
      ? t("settings.hint.checkingUpdate")
      : harnessVersionLine;

  const faultActions = fault ? parseFaultDisplay(fault.message).actions : [];
  const primaryFaultCta = faultActions[0];
  const secondaryFaultCtas = faultActions.slice(1);

  const showShellCheck =
    shellUpd.phase !== "downloaded" &&
    shellUpd.phase !== "unsupported" &&
    !shellChecking;
  const showShellInstall = shellUpd.phase === "downloaded";

  const showHarnessCheck =
    !fault &&
    !updateCheck?.updateAvailable &&
    !checkingUpdate &&
    !locked;
  const showHarnessInstall =
    !!updateCheck?.updateAvailable && !locked && !fault;
  const showHarnessRetry = !!fault && !!primaryFaultCta && !locked;

  const harnessFooter =
    opsActive || fault ? (
      <>
        {opsActive ? <SettingsUpdateProgress showMessage={false} /> : null}
        {fault ? (
          <SettingsUpdateNotice
            error={fault.message}
            installMode={installMode}
            secondaryActions={secondaryFaultCtas}
            onCta={onFaultCta}
          />
        ) : null}
      </>
    ) : null;

  const harnessLabel = harnessVersionLabel(runtime, locked, t);

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
            <span className="settings-about-name">{t("settings.about.tag")}</span>
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
                  {harnessLabel}
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
            <>
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
              <div className="settings-about-advanced-actions">
                <SettingsPrefRow
                  title={t("settings.about.resetOnboarding")}
                  description={t("settings.about.resetOnboardingDesc")}
                >
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      void (async () => {
                        try {
                          const s = normalizeShellSettings(
                            await shellApi.getShellSettings(),
                          );
                          await shellApi.saveRuntimeSettings({
                            ...runtimeFromSettings(s),
                            onboardingDone: false,
                          });
                          showToast(t("settings.about.resetOnboardingDone"));
                        } catch (e) {
                          shellLog.error("settings", "reset onboarding", e);
                        }
                      })();
                    }}
                  >
                    {t("settings.about.resetOnboardingAction")}
                  </button>
                </SettingsPrefRow>
              </div>
            </>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.updates")}>
        <SettingsUpdateRow
          title={t("settings.about.shellUpdate.rowTitle")}
          description={shellDesc}
          disabled={shellUpd.phase === "unsupported"}
          actions={
            <>
              {showShellCheck ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={shellChecking}
                  onClick={() => void shellUpd.checkNow(true)}
                >
                  {t("settings.about.shellUpdate.check")}
                </button>
              ) : null}
              {showShellInstall ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void shellUpd.installAndRelaunch()}
                >
                  {t("settings.about.shellUpdate.install")}
                </button>
              ) : null}
            </>
          }
        />
        <SettingsUpdateRow
          title={t("settings.about.harnessUpdate.rowTitle")}
          description={harnessDesc}
          disabled={locked && !opsActive}
          actions={
            <>
              {showHarnessCheck ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={locked || checkingUpdate}
                  onClick={() => void onCheckUpdate()}
                >
                  {t("settings.about.checkUpdate")}
                </button>
              ) : null}
              {showHarnessInstall ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={locked}
                  onClick={() => void onApplyUpdate()}
                >
                  {t("settings.about.applyUpdate")}
                </button>
              ) : null}
              {showHarnessRetry && primaryFaultCta ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onFaultCta(primaryFaultCta)}
                >
                  {t(CTA_LABEL_KEYS[primaryFaultCta])}
                </button>
              ) : null}
            </>
          }
          footer={harnessFooter}
        />
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
