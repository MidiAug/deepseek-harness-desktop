import type { Dispatch, SetStateAction } from "react";
import type { ShellSettings } from "../../shell/settings";
import {
  shellApi,
  useAppToast,
  useHarnessSettingsOps,
  type RuntimeStatus,
} from "../../shell";
import { useLocale } from "../../shell/locale";
import type { CliLinkStatus } from "../../shell/api/shellApi";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect } from "../chrome/ShellSelect";
import type { RuntimeSource } from "../../shell/settings";

type Props = {
  settings: ShellSettings;
  runtime: RuntimeStatus | null;
  cliStatus: CliLinkStatus | null;
  portDraft: string;
  setPortDraft: Dispatch<SetStateAction<string>>;
  locked: boolean;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
  setError: (error: string | null, retry?: () => void | Promise<void>) => void;
  setSettings: Dispatch<SetStateAction<ShellSettings>>;
  setCliStatus: Dispatch<SetStateAction<CliLinkStatus | null>>;
  refreshRuntime: () => void;
  onStopHarness?: () => void;
};

export function SettingsSectionRuntime({
  settings,
  runtime,
  cliStatus,
  portDraft,
  setPortDraft,
  locked,
  patchRuntime,
  setError,
  setSettings,
  setCliStatus,
  refreshRuntime,
  onStopHarness,
}: Props) {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const { onApplyNetworkRestart } = useHarnessSettingsOps();
  const ready = !!runtime?.harnessReady && !!runtime?.port;
  const sourceOptions: { value: RuntimeSource; label: string }[] = [
    { value: "auto", label: t("settings.runtimeSource.auto") },
    { value: "system", label: t("settings.runtimeSource.system") },
    { value: "hosted", label: t("settings.runtimeSource.hosted") },
  ];

  return (
    <div className="settings-section">
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
              <dt>{t("settings.port.current")}</dt>
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
            <div>
              <dt>{t("settings.runtimeSource.active")}</dt>
              <dd>
                {runtime?.activeRuntime === "system"
                  ? t("settings.runtimeSource.activeSystem")
                  : runtime?.activeRuntime === "hosted"
                    ? t("settings.runtimeSource.activeHosted")
                    : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.runtimeSource")}>
        <SettingsPrefRow
          title={t("settings.runtimeSource.title")}
          description={`${t("settings.runtimeSource.description")} ${
            runtime?.systemRuntimeDetected
              ? t("settings.runtimeSource.detected")
              : t("settings.runtimeSource.notDetected")
          }`}
        >
          <ShellSelect
            aria-label={t("settings.runtimeSource.aria")}
            value={settings.runtimeSource}
            options={sourceOptions}
            disabled={locked}
            onChange={(value) => {
              patchRuntime(
                { runtimeSource: value as RuntimeSource },
                { softHint: t("settings.runtimeSource.restartHint") },
              );
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
