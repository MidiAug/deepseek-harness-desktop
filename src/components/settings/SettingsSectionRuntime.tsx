import { useEffect, useState } from "react";
import type { ShellSettings } from "../../shell/settings";
import {
  runtimeFromSettings,
  type RuntimeSource,
} from "../../shell/settings";
import {
  shellApi,
  useAppToast,
  useHarnessSettingsOps,
  useSettingsPanelContext,
} from "../../shell";
import { useLocale } from "../../shell/locale";
import type { CliLinkStatus } from "../../shell/api/shellApi";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect } from "../chrome/ShellSelect";
import { ShellConfirmDialog } from "../chrome/ShellConfirmDialog";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { IconWarningCircleOutline16 } from "../chrome/DshIcons";
import type { InstallMode } from "../../shell/runtime/installMode";

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
  } = useSettingsPanelContext();
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const { onApplyNetworkRestart } = useHarnessSettingsOps();
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
  const ready = !!runtime?.harnessReady && !!runtime?.port;
  const preferred = preferredInstallMode(settings.runtimeSource);
  const running = runtime?.activeRuntime ?? null;
  const runningLabel =
    running === "system" || running === "hosted"
      ? installModeLabel(running, t)
      : null;
  const preferredLabel = installModeLabel(preferred, t);
  const runtimeMismatch =
    running != null && running !== preferred;
  const sourceOptions: { value: RuntimeSource; label: string }[] = [
    { value: "system", label: t("settings.harnessInstall.system") },
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
      await onApplyNetworkRestart();
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
          <div className="settings-status-block__row">
            <span className={`settings-pill${ready ? " ok" : " warn"}`}>
              {ready
                ? t("settings.about.ready")
                : locked
                  ? t("settings.about.installing")
                  : t("settings.about.notInstalled")}
            </span>
            <span className="mono shell-copyable">
              {runtime?.port ? `:${runtime.port}` : "—"}
            </span>
            <span className="mono shell-copyable" title="digest">
              {runtime?.harnessDigest
                ? String(runtime.harnessDigest).slice(0, 12)
                : "—"}
            </span>
          </div>
          <dl className="settings-status-block__meta">
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
            <div>
              <dt>{t("settings.harnessInstall.source")}</dt>
              <dd className="settings-status-block__source">
                <span>{runningLabel ?? preferredLabel}</span>
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

      <SettingsGroup title={t("settings.group.controls")}>
        <div className="settings-cell-actions settings-cell-actions--primary">
          <button
            type="button"
            className="btn"
            disabled={locked}
            onClick={() => void onApplyNetworkRestart()}
          >
            {t("settings.port.restart")}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={locked}
            onClick={() => {
              onStopHarness?.();
              showToast(t("settings.port.stopped"));
              refreshRuntime();
            }}
          >
            {t("settings.port.stop")}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!runtime?.port}
            onClick={() => {
              const url = `http://127.0.0.1:${runtime?.port}`;
              void navigator.clipboard.writeText(url).then(
                () => showToast(t("settings.port.copied")),
                () => setError(t("settings.port.copyFail")),
              );
            }}
          >
            {t("settings.port.copy")}
          </button>
          <button
            type="button"
            className="btn ghost"
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
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.port")}>
        <SettingsPrefRow
          title={t("settings.port.title")}
          description={t("settings.port.description")}
          layout="stack"
        >
          <input
            className="settings-control"
            type="number"
            min={0}
            max={65535}
            placeholder={t("settings.port.placeholder")}
            value={portDraft}
            onChange={(ev) => {
              setPortDraft(ev.target.value);
              const n = Number(ev.target.value);
              const preferredPort =
                ev.target.value.trim() === "" || !Number.isFinite(n)
                  ? 0
                  : Math.max(0, Math.min(65535, Math.floor(n)));
              patchRuntime(
                { preferredPort },
                { softHint: t("settings.port.saved") },
              );
            }}
          />
        </SettingsPrefRow>
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
