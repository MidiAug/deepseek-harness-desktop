import type { Dispatch, SetStateAction } from "react";
import type { ShellSettings } from "../../shell/settings";
import { shellApi, useHarnessSettingsOps, type RuntimeStatus } from "../../shell";
import { useLocale } from "../../shell/locale";
import type { CliLinkStatus } from "../../shell/api/shellApi";
import { SettingsPrefRow } from "./SettingsPrefRow";

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
  flashHint: (msg: string) => void;
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
  flashHint,
  setError,
  setSettings,
  setCliStatus,
  refreshRuntime,
  onStopHarness,
}: Props) {
  const { t } = useLocale();
  const { onApplyNetworkRestart } = useHarnessSettingsOps();

  return (
    <div className="settings-section">
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
      <SettingsPrefRow
        title={t("settings.port.current")}
        description={t("settings.port.currentDesc")}
      >
        <span className="mono">{runtime?.port ?? "—"}</span>
      </SettingsPrefRow>
      <div className="settings-cell-actions">
        <button
          type="button"
          className="btn"
          disabled={!runtime?.port}
          onClick={() => {
            const url = `http://127.0.0.1:${runtime?.port}`;
            void navigator.clipboard.writeText(url).then(
              () => flashHint(t("settings.port.copied")),
              () => setError(t("settings.port.copyFail")),
            );
          }}
        >
          {t("settings.port.copy")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!runtime?.port}
          onClick={() => {
            const url = `http://127.0.0.1:${runtime?.port}`;
            void shellApi
              .openLoopbackUrl(url)
              .then(() => flashHint(t("settings.port.opened")))
              .catch((e) => setError(String(e)));
          }}
        >
          {t("settings.port.openBrowser")}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={locked}
          onClick={() => {
            onStopHarness?.();
            flashHint(t("settings.port.stopped"));
            refreshRuntime();
          }}
        >
          {t("settings.port.stop")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={locked}
          onClick={() => void onApplyNetworkRestart()}
        >
          {t("settings.port.restart")}
        </button>
      </div>

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
                flashHint(
                  next ? t("settings.cli.enabled") : t("settings.cli.disabled"),
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
        <p className="settings-live-hint">
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
    </div>
  );
}
