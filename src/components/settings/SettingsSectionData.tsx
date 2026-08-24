import { useCallback, useState } from "react";
import type { ShellSettings } from "../../shell/settings";
import {
  shellApi,
  type ReadyPayload,
  type RuntimeStatus,
  useAppToast,
} from "../../shell";
import { useLocale } from "../../shell/locale";
import { ShellConfirmDialog } from "../chrome/ShellConfirmDialog";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  runtime: RuntimeStatus | null;
  locked: boolean;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
  setError: (error: string | null, retry?: () => void | Promise<void>) => void;
  refreshRuntime: () => void;
  onHarnessReady?: (payload: ReadyPayload) => void;
  onDiagnosticsExported?: (path: string) => void;
  onDiagnosticsError?: (
    message: string,
    retry?: () => void | Promise<void>,
  ) => void;
};

function PathOpenRow({
  which,
  title,
  description,
  openLabel,
}: {
  which: "dshHome" | "appData" | "logs";
  title: string;
  description: string;
  openLabel: string;
}) {
  return (
    <SettingsPrefRow title={title} description={description}>
      <button
        type="button"
        className="btn ghost"
        onClick={() => void shellApi.openKnownPath(which)}
      >
        {openLabel}
      </button>
    </SettingsPrefRow>
  );
}

export function SettingsSectionData({
  settings,
  runtime,
  locked,
  patchRuntime,
  setError,
  refreshRuntime,
  onHarnessReady,
  onDiagnosticsExported,
  onDiagnosticsError,
}: Props) {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const [cleanProfileConfirmOpen, setCleanProfileConfirmOpen] = useState(false);
  const [cleanProfileBusy, setCleanProfileBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const runStartCleanProfile = useCallback(async () => {
    setError(null);
    setCleanProfileBusy(true);
    try {
      const ready = await shellApi.startCleanProfile();
      setCleanProfileConfirmOpen(false);
      showToast(t("settings.data.cleanProfile.done"));
      refreshRuntime();
      onHarnessReady?.(ready);
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      setError(msg, runStartCleanProfile);
    } finally {
      setCleanProfileBusy(false);
    }
  }, [onHarnessReady, refreshRuntime, setError, showToast, t]);

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
    <div className="settings-section">
      <ShellConfirmDialog
        open={cleanProfileConfirmOpen}
        titleKey="settings.data.cleanProfile.confirmTitle"
        bodyKey="settings.data.cleanProfile.confirm"
        busy={cleanProfileBusy}
        onCancel={() => {
          if (!cleanProfileBusy) setCleanProfileConfirmOpen(false);
        }}
        onConfirm={() => void runStartCleanProfile()}
      />

      <SettingsGroup title={t("settings.group.paths")}>
        <SettingsPrefRow
          title={t("settings.data.dshHome.title")}
          description={t("settings.data.dshHome.description")}
          layout="stack"
        >
          <input
            className="settings-control"
            type="text"
            placeholder={t("settings.data.dshHome.placeholder")}
            value={settings.dshHomeOverride}
            onChange={(ev) =>
              patchRuntime(
                { dshHomeOverride: ev.target.value },
                {
                  debounceMs: 350,
                  softHint: t("settings.data.dshHome.saved"),
                },
              )
            }
          />
        </SettingsPrefRow>
        <PathOpenRow
          which="logs"
          title={t("settings.data.path.logsTitle")}
          description={t("settings.data.path.logsDesc")}
          openLabel={t("settings.data.path.open")}
        />
        <PathOpenRow
          which="appData"
          title={t("settings.data.path.appDataTitle")}
          description={t("settings.data.path.appDataDesc")}
          openLabel={t("settings.data.path.open")}
        />
        <PathOpenRow
          which="dshHome"
          title={t("settings.data.path.dshHomeTitle")}
          description={t("settings.data.path.dshHomeDesc")}
          openLabel={t("settings.data.path.open")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.diagnostics")}>
        <SettingsPrefRow
          title={t("settings.about.exportDiagnostics")}
          description={t("settings.data.diagnostics.hint")}
          layout="stack"
        >
          <button
            type="button"
            className="btn"
            disabled={locked || exporting}
            onClick={() => void onExportDiagnostics()}
          >
            {t("settings.about.exportDiagnostics")}
          </button>
        </SettingsPrefRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.recovery")}>
        <SettingsPrefRow
          title={t("settings.data.cleanProfile.title")}
          description={t("settings.data.cleanProfile.description")}
          layout="stack"
        >
          {runtime?.cleanProfileActive ? (
            <p className="settings-cell-desc">
              {t("settings.data.cleanProfile.active")}
            </p>
          ) : null}
          <div className="settings-cell-actions">
            {runtime?.cleanProfileActive ? (
              <button
                type="button"
                className="btn ghost"
                disabled={locked}
                onClick={() => {
                  const runExit = async () => {
                    setError(null);
                    try {
                      const ready = await shellApi.exitCleanProfile();
                      showToast(t("settings.data.cleanProfile.exitDone"));
                      refreshRuntime();
                      onHarnessReady?.(ready);
                    } catch (e) {
                      const msg = typeof e === "string" ? e : String(e);
                      setError(msg, runExit);
                    }
                  };
                  void runExit();
                }}
              >
                {t("settings.data.cleanProfile.exit")}
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost"
                disabled={locked}
                onClick={() => setCleanProfileConfirmOpen(true)}
              >
                {t("settings.data.cleanProfile.start")}
              </button>
            )}
          </div>
        </SettingsPrefRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.danger")} danger>
        <SettingsPrefRow
          title={t("settings.data.reset.title")}
          description={t("settings.data.reset.description")}
          layout="stack"
        >
          <button
            type="button"
            className="btn ghost"
            disabled={locked}
            onClick={() => {
              if (!window.confirm(t("settings.data.reset.confirm"))) {
                return;
              }
              const runReset = async () => {
                setError(null);
                try {
                  const ready = await shellApi.resetHostedRuntime();
                  showToast(t("settings.data.reset.done"));
                  refreshRuntime();
                  onHarnessReady?.(ready);
                } catch (e) {
                  const msg = typeof e === "string" ? e : String(e);
                  setError(msg, runReset);
                }
              };
              void runReset();
            }}
          >
            {t("settings.data.reset.button")}
          </button>
        </SettingsPrefRow>
      </SettingsGroup>
    </div>
  );
}
