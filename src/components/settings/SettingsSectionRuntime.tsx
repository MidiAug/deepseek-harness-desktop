import { useEffect, useState } from "react";
import type { ShellSettings } from "../../shell/settings";
import {
  runtimeFromSettings,
  type RuntimeSource,
} from "../../shell/settings";
import {
  shellApi,
  shellLog,
  useAppToast,
  useHarnessSettingsOps,
  useSettingsPanelContext,
} from "../../shell";
import { useLocale } from "../../shell/locale";
import type { CliLinkStatus } from "../../shell/api/shellApi";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect, type ShellSelectOption } from "../chrome/ShellSelect";
import { ShellConfirmDialog } from "../chrome/ShellConfirmDialog";
import { ShellTooltip } from "../chrome/ShellTooltip";
import {
  IconCopyOutline14,
  IconWarningCircleOutline16,
} from "../chrome/DshIcons";
import type { InstallMode } from "../../shell/runtime/installMode";
import { statusProcessKind } from "../../shell/runtime/statusProcess";

function preferredInstallMode(
  runtimeSource: ShellSettings["runtimeSource"],
): InstallMode {
  if (runtimeSource === "system" || runtimeSource === "hosted") {
    return runtimeSource;
  }
  return "hosted";
}

function installModeLabel(mode: InstallMode, t: (key: "settings.harnessInstall.system" | "settings.harnessInstall.hosted") => string) {
  return mode === "system"
    ? t("settings.harnessInstall.system")
    : t("settings.harnessInstall.hosted");
}

export function SettingsSectionRuntime() {
  const {
    settings,
    runtime,
    portDraft,
    setPortDraft,
    locked,
    patchRuntime,
    reportFault,
    setSettings,
    refreshRuntime,
    onStopHarness,
    onRestartHarness,
  } = useSettingsPanelContext();
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const { onEnsureStart } = useHarnessSettingsOps();
  const setError = reportFault;
  const [cliStatus, setCliStatus] = useState<CliLinkStatus | null>(null);
  const [pendingSource, setPendingSource] = useState<RuntimeSource | null>(null);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [restartConfirmBusy, setRestartConfirmBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void shellApi
      .getCliLinkStatus()
      .then((st) => {
        if (!cancelled) setCliStatus(st);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const ready = !!runtime?.processRunning && !!runtime?.port;
  const processKind = statusProcessKind({
    processRunning: ready,
    locked,
  });
  const preferred = preferredInstallMode(settings.runtimeSource);
  const running = runtime?.activeRuntime ?? null;
  const runningLabel =
    running === "system" || running === "hosted"
      ? installModeLabel(running, t)
      : null;
  const preferredLabel = installModeLabel(preferred, t);
  const runtimeMismatch =
    running != null && running !== preferred;
  const systemAvailable = runtime?.systemRuntimeDetected ?? false;
  const sourceOptions: ShellSelectOption[] = [
    {
      value: "system",
      label: t("settings.harnessInstall.system"),
      disabled: !systemAvailable,
      title: systemAvailable
        ? undefined
        : t("settings.harnessInstall.systemDisabledTip"),
    },
    { value: "hosted", label: t("settings.harnessInstall.hosted") },
  ];
  const effectiveSource =
    settings.runtimeSource === "auto" ? preferred : settings.runtimeSource;
  const selectValue = pendingSource ?? effectiveSource;

  function applyPendingSource() {
    if (!pendingSource) return;
    patchRuntime({ runtimeSource: pendingSource });
    setPendingSource(null);
    setRestartConfirmOpen(false);
  }

  async function applyPendingSourceAndRestart() {
    if (!pendingSource || restartConfirmBusy) return;
    const nextSource = pendingSource;
    setRestartConfirmBusy(true);
    try {
      const next = { ...settings, runtimeSource: nextSource };
      setSettings(next);
      await shellApi.saveRuntimeSettings(runtimeFromSettings(next));
      setPendingSource(null);
      setRestartConfirmOpen(false);
      onRestartHarness?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setRestartConfirmBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <ShellConfirmDialog
        open={restartConfirmOpen}
        titleKey="settings.harnessInstall.restartConfirmTitle"
        bodyKey="settings.harnessInstall.restartConfirmBody"
        confirmKey="settings.harnessInstall.restartNow"
        cancelKey="settings.harnessInstall.restartLater"
        busy={restartConfirmBusy}
        onCancel={() => {
          if (restartConfirmBusy) return;
          applyPendingSource();
        }}
        onConfirm={() => void applyPendingSourceAndRestart()}
      />
      <SettingsGroup title={t("settings.group.status")}>
        <div className="settings-status-block">
          <dl className="settings-status-grid">
            <div className="settings-status-grid__row">
              <dt>{t("settings.status.state")}</dt>
              <dd className="settings-status-grid__state">
                <span className={`settings-pill${ready ? " ok" : " warn"}`}>
                  {processKind === "ready"
                    ? t("settings.status.running")
                    : processKind === "busy"
                      ? t("settings.status.busy")
                      : t("settings.status.notRunning")}
                </span>
                <div className="settings-status-actions">
                  {ready ? (
                    <>
                      <ShellTooltip
                        label={t("settings.port.restartTip")}
                        side="top"
                        delayMs={300}
                      >
                        <button
                          type="button"
                          className="btn ghost settings-status-actions__btn"
                          aria-label={t("settings.port.restartTip")}
                          disabled={locked}
                          onClick={() => {
                            shellLog.op("settings.runtime.restart");
                            onRestartHarness?.();
                          }}
                        >
                          {t("settings.port.restart")}
                        </button>
                      </ShellTooltip>
                      <ShellTooltip
                        label={t("settings.port.stopTip")}
                        side="top"
                        delayMs={300}
                      >
                        <button
                          type="button"
                          className="btn ghost settings-status-actions__btn"
                          aria-label={t("settings.port.stopTip")}
                          disabled={locked}
                          onClick={() => {
                            void (async () => {
                              shellLog.op("settings.runtime.stop");
                              await onStopHarness?.();
                              refreshRuntime();
                              showToast(t("settings.port.stopped"));
                            })();
                          }}
                        >
                          {t("settings.port.stop")}
                        </button>
                      </ShellTooltip>
                    </>
                  ) : (
                    <ShellTooltip
                      label={t("settings.port.startTip")}
                      side="top"
                      delayMs={300}
                    >
                      <button
                        type="button"
                        className="btn settings-status-actions__btn"
                        aria-label={t("settings.port.startTip")}
                        disabled={locked}
                        onClick={() => void onEnsureStart()}
                      >
                        {t("settings.port.start")}
                      </button>
                    </ShellTooltip>
                  )}
                </div>
              </dd>
            </div>
            <div className="settings-status-grid__row">
              <dt>{t("settings.status.port")}</dt>
              <dd className="settings-status-grid__port">
                <span className="settings-status-block__port mono">
                  {runtime?.port ? String(runtime.port) : "—"}
                </span>
                <div className="settings-status-actions">
                  <ShellTooltip
                    label={t("settings.port.openBrowserTip")}
                    side="top"
                    delayMs={300}
                  >
                    <button
                      type="button"
                      className="btn ghost settings-status-actions__btn"
                      aria-label={t("settings.port.openBrowserTip")}
                      disabled={!runtime?.port}
                      onClick={() => {
                        const url = `http://127.0.0.1:${runtime?.port}`;
                        void shellApi
                          .openLoopbackUrl(url)
                          .then(() => showToast(t("settings.port.opened")))
                          .catch((e) => setError(String(e)));
                      }}
                    >
                      {t("settings.port.openBrowser")}
                    </button>
                  </ShellTooltip>
                </div>
              </dd>
            </div>
            <div className="settings-status-grid__row">
              <dt>{t("settings.status.node")}</dt>
              <dd>
                <span>
                  {runtime?.nodeReady
                    ? t("settings.about.ready")
                    : t("settings.about.nodeMissing")}
                </span>
              </dd>
            </div>
            <div className="settings-status-grid__row">
              <dt>{t("settings.status.source")}</dt>
              <dd className="settings-status-block__source">
                <span>
                  {runningLabel
                    ? runtimeMismatch
                      ? `${runningLabel} → ${preferredLabel}`
                      : runningLabel
                    : preferredLabel}
                </span>
                {runtimeMismatch ? (
                  <ShellTooltip
                    label={t("settings.harnessInstall.switchedRestart")}
                    side="top"
                    delayMs={300}
                  >
                    <span
                      className="settings-status-warn-icon"
                      tabIndex={0}
                      role="img"
                      aria-label={t("settings.harnessInstall.switchedRestart")}
                    >
                      <IconWarningCircleOutline16 size={16} />
                    </span>
                  </ShellTooltip>
                ) : null}
              </dd>
            </div>
            {runtime?.harnessDigest ? (
              <div className="settings-status-grid__row">
                <dt>{t("settings.status.digest")}</dt>
                <dd>
                  <span className="settings-status-value">
                    <span
                      className="settings-status-block__digest mono"
                      title={String(runtime.harnessDigest)}
                    >
                      {String(runtime.harnessDigest).slice(0, 12)}
                    </span>
                    <ShellTooltip
                      label={t("settings.status.copyDigest")}
                      side="top"
                      delayMs={280}
                    >
                      <button
                        type="button"
                        className="settings-inline-copy"
                        aria-label={t("settings.status.copyDigest")}
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(String(runtime.harnessDigest))
                            .then(
                              () =>
                                showToast(t("settings.status.digestCopied")),
                              () => setError(t("settings.port.copyFail")),
                            );
                        }}
                      >
                        <IconCopyOutline14 />
                      </button>
                    </ShellTooltip>
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.harnessInstall")}>
        <SettingsPrefRow
          title={t("settings.harnessInstall.title")}
          description={`${t("settings.harnessInstall.description")} ${
            runtime?.systemRuntimeDetected
              ? t("settings.harnessInstall.detected")
              : t("settings.harnessInstall.notDetected")
          }`}
        >
          <ShellSelect
            aria-label={t("settings.harnessInstall.aria")}
            value={selectValue}
            options={sourceOptions}
            disabled={locked || restartConfirmBusy}
            onChange={(value) => {
              const next = value as RuntimeSource;
              if (next === "system" && !systemAvailable) return;
              if (next === effectiveSource) {
                setPendingSource(null);
                setRestartConfirmOpen(false);
                return;
              }
              const needsRestart =
                (running === "system" || running === "hosted") &&
                next !== running;
              if (!needsRestart) {
                patchRuntime({ runtimeSource: next });
                setPendingSource(null);
                setRestartConfirmOpen(false);
                return;
              }
              setPendingSource(next);
              setRestartConfirmOpen(true);
            }}
          />
        </SettingsPrefRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.port")}>
        <SettingsPrefRow
          title={t("settings.port.title")}
          description={t("settings.port.description")}
        >
          <div className="settings-port-field">
            <span className="settings-port-field-host" aria-hidden>
              127.0.0.1
            </span>
            <span className="settings-port-field-sep" aria-hidden>
              :
            </span>
            <ShellTooltip
              label={t("settings.port.descriptionTip")}
              side="top"
              delayMs={300}
            >
              <input
                className="settings-port-field-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={5}
                aria-label={t("settings.port.title")}
                aria-describedby="settings-port-hint"
                placeholder={t("settings.port.placeholder")}
                value={portDraft}
                onChange={(ev) => {
                  const raw = ev.target.value.replace(/\D/g, "").slice(0, 5);
                  setPortDraft(raw);
                  const n = Number(raw);
                  const preferredPort =
                    raw === "" || !Number.isFinite(n)
                      ? 0
                      : Math.max(0, Math.min(65535, Math.floor(n)));
                  patchRuntime(
                    { preferredPort },
                    { softHint: t("settings.port.saved") },
                  );
                }}
              />
            </ShellTooltip>
          </div>
        </SettingsPrefRow>
        <p id="settings-port-hint" className="settings-live-hint">
          {t("settings.port.hint")}
        </p>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.cli")}>
        <SettingsPrefRow
          title={t("settings.cli.title")}
          description={t("settings.cli.description")}
        >
          <button
            type="button"
            className={`settings-switch${settings.cliLinkEnabled ? " on" : ""}`}
            role="switch"
            aria-checked={settings.cliLinkEnabled}
            aria-label={t("settings.cli.aria")}
            disabled={locked}
            onClick={() => {
              const next = !settings.cliLinkEnabled;
              setSettings((s) => ({ ...s, cliLinkEnabled: next }));
              void shellApi
                .setCliLinkEnabled(next)
                .then((st) => {
                  setCliStatus(st);
                  showToast(
                    next
                      ? t("settings.cli.enabled")
                      : t("settings.cli.disabled"),
                  );
                })
                .catch((e) => {
                  setError(String(e));
                  setSettings((s) => ({
                    ...s,
                    cliLinkEnabled: !next,
                  }));
                });
            }}
          >
            <span className="settings-switch-knob" />
          </button>
        </SettingsPrefRow>
        {cliStatus && (
          <p className="settings-live-hint mono">
            shim{" "}
            {cliStatus.shimExists
              ? t("settings.cli.shimYes")
              : t("settings.cli.shimNo")}
            {" · "}
            PATH{" "}
            {cliStatus.pathRegistered
              ? t("settings.cli.pathYes")
              : t("settings.cli.pathNo")}
            {cliStatus.binDir ? ` · ${cliStatus.binDir}` : ""}
          </p>
        )}
      </SettingsGroup>
    </div>
  );
}
