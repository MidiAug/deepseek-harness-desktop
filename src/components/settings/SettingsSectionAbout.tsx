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
import { ShellTooltip } from "../chrome/ShellTooltip";
import { parseFaultDisplay, CTA_LABEL_KEYS } from "../../shell/errors";
import type { RuntimeStatus } from "../../shell";
import { GITHUB_REPO_URL } from "../../shell/settings";

function harnessVersionLabel(
  runtime: RuntimeStatus | null,
  t: (key: import("../../shell/locale").LocaleKey) => string,
): string {
  if (runtime?.harnessVersion) return runtime.harnessVersion;
  if (runtime?.processRunning) return t("settings.about.harnessRunning");
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
  const harnessFaultMessage =
    life.bootFault.message ?? fault?.message ?? null;

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
              : shellUpd.phase === "error"
                ? t("settings.about.shellUpdate.checkFailed", {
                    error: shellUpd.message ?? "",
                  })
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

  const faultActions = harnessFaultMessage
    ? parseFaultDisplay(harnessFaultMessage).actions
    : [];
  const primaryFaultCta = faultActions[0];
  const secondaryFaultCtas = faultActions.slice(1);

  const showShellCheck =
    shellUpd.phase !== "downloaded" &&
    shellUpd.phase !== "unsupported" &&
    !shellChecking;
  const showShellInstall = shellUpd.phase === "downloaded";
  // error / upToDate 仍显示「检查」，便于重试

  const showHarnessCheck =
    !harnessFaultMessage &&
    !updateCheck?.updateAvailable &&
    !checkingUpdate &&
    !locked;
  const showHarnessInstall =
    !!updateCheck?.updateAvailable && !locked && !harnessFaultMessage;
  const showHarnessRetry =
    !!harnessFaultMessage && !!primaryFaultCta && !locked;

  const harnessFooter =
    opsActive || harnessFaultMessage ? (
      <>
        {opsActive ? <SettingsUpdateProgress showMessage={false} /> : null}
        {harnessFaultMessage ? (
          <SettingsUpdateNotice
            error={harnessFaultMessage}
            installMode={installMode}
            secondaryActions={secondaryFaultCtas}
            onCta={onFaultCta}
          />
        ) : null}
      </>
    ) : null;

  const harnessLabel = harnessVersionLabel(runtime, t);

  useEffect(() => {
    if (life.logLines.length === 0) return;
    const end = logEndRef.current;
    if (!end) return;
    // 只滚日志盒，禁止 scrollIntoView 把外层 .settings-scroll 拖到底
    const logBox = end.closest(".settings-log");
    if (logBox instanceof HTMLElement) {
      logBox.scrollTop = logBox.scrollHeight;
    }
  }, [life.logLines]);

  function copyLog() {
    const text = life.logLines.join("\n");
    if (!text) return;
    void navigator.clipboard.writeText(text).then(
      () => showToast(t("contextMenu.copied")),
      () => undefined,
    );
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
                    <span>
                      {runtime?.nodeReady
                        ? t("settings.about.ready")
                        : t("settings.about.nodeMissing")}
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="settings-about-advanced-actions">
                <SettingsPrefRow
                  title={t("settings.about.resetOnboarding")}
                  description={t("settings.about.resetOnboardingDesc")}
                >
                  <ShellTooltip
                    label={t("settings.about.resetOnboardingActionTip")}
                    side="top"
                    delayMs={300}
                  >
                    <button
                      type="button"
                      className="btn ghost"
                      aria-label={t("settings.about.resetOnboardingActionTip")}
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
                  </ShellTooltip>
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
                <ShellTooltip
                  label={t("settings.about.shellUpdate.checkTip")}
                  side="top"
                  delayMs={300}
                >
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={t("settings.about.shellUpdate.checkTip")}
                    disabled={shellChecking}
                    onClick={() => void shellUpd.checkNow(true)}
                  >
                    {t("settings.about.shellUpdate.check")}
                  </button>
                </ShellTooltip>
              ) : null}
              {showShellInstall ? (
                <ShellTooltip
                  label={t("settings.about.shellUpdate.installTip")}
                  side="top"
                  delayMs={300}
                >
                  <button
                    type="button"
                    className="btn primary"
                    aria-label={t("settings.about.shellUpdate.installTip")}
                    onClick={() => void shellUpd.installAndRelaunch()}
                  >
                    {t("settings.about.shellUpdate.install")}
                  </button>
                </ShellTooltip>
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
                <ShellTooltip
                  label={t("settings.about.checkUpdateTip")}
                  side="top"
                  delayMs={300}
                >
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={t("settings.about.checkUpdateTip")}
                    disabled={locked || checkingUpdate}
                    onClick={() => void onCheckUpdate()}
                  >
                    {t("settings.about.checkUpdate")}
                  </button>
                </ShellTooltip>
              ) : null}
              {showHarnessInstall ? (
                <ShellTooltip
                  label={t("settings.about.applyUpdateTip")}
                  side="top"
                  delayMs={300}
                >
                  <button
                    type="button"
                    className="btn primary"
                    aria-label={t("settings.about.applyUpdateTip")}
                    disabled={locked}
                    onClick={() => void onApplyUpdate()}
                  >
                    {t("settings.about.applyUpdate")}
                  </button>
                </ShellTooltip>
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
          <ShellTooltip
            label={t("settings.about.openPlatformTip")}
            side="top"
            delayMs={300}
          >
            <button
              type="button"
              className="btn ghost"
              aria-label={t("settings.about.openPlatformTip")}
              onClick={() => {
                void shellApi
                  .openPlatformWindow()
                  .catch((e) => shellLog.error("about", "open platform", e));
              }}
            >
              {t("settings.about.openPlatformAction")}
            </button>
          </ShellTooltip>
        </SettingsPrefRow>
        <SettingsPrefRow
          title={t("settings.about.githubRepo")}
          description={t("settings.about.githubHint")}
        >
          <ShellTooltip
            label={t("settings.about.openGithubTip")}
            side="top"
            delayMs={300}
          >
            <button
              type="button"
              className="btn ghost"
              aria-label={t("settings.about.openGithubTip")}
              onClick={() => {
                shellLog.op("nav.github.open");
                void shellApi
                  .openExternalUrl(GITHUB_REPO_URL)
                  .catch((e) => shellLog.error("about", "open github", e));
              }}
            >
              {t("settings.about.openPlatformAction")}
            </button>
          </ShellTooltip>
        </SettingsPrefRow>
      </SettingsGroup>

      {hasLog && (
        <SettingsGroup title={t("settings.about.viewLogs")}>
          <div className="settings-ops-log-body">
            <div className="settings-cell-actions">
              <ShellTooltip
                label={t("settings.about.copyLogTip")}
                side="top"
                delayMs={300}
              >
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={t("settings.about.copyLogTip")}
                  onClick={copyLog}
                >
                  {t("settings.about.copyLog")}
                </button>
              </ShellTooltip>
              <ShellTooltip
                label={t("settings.about.openLogsDirTip")}
                side="top"
                delayMs={300}
              >
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={t("settings.about.openLogsDirTip")}
                  onClick={() => {
                    void shellApi
                      .openKnownPath("logs")
                      .catch((e) => shellLog.error("about", "open logs", e));
                  }}
                >
                  {t("settings.about.openLogsDir")}
                </button>
              </ShellTooltip>
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
