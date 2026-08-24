import { useCallback, useState } from "react";
import type { ShellSettings } from "../../shell/settings";
import {
  shellApi,
  shellLog,
  type ReadyPayload,
  type RuntimeStatus,
  useAppToast,
  useHostLifecycle,
} from "../../shell";
import { shortenPathForDisplay } from "../../shell/formatPathShort";
import { useLocale } from "../../shell/locale";
import { resolveInstallMode } from "../../shell/runtime/installMode";
import { IconFolderOpenOutline16 } from "../chrome/DshIcons";
import { ShellConfirmDialog } from "../chrome/ShellConfirmDialog";
import { ShellTooltip } from "../chrome/ShellTooltip";
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
  onCloseSettings?: () => void;
  onBeginHarnessOp?: () => void;
  onHarnessOpFailed?: (message: string) => void;
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
  onCloseSettings,
  onBeginHarnessOp,
  onHarnessOpFailed,
  onDiagnosticsExported,
  onDiagnosticsError,
}: Props) {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const life = useHostLifecycle();
  const installMode = resolveInstallMode({
    runtimeSource: settings.runtimeSource,
    activeRuntime: runtime?.activeRuntime,
  });
  const [cleanProfileConfirmOpen, setCleanProfileConfirmOpen] = useState(false);
  const [cleanProfileBusy, setCleanProfileBusy] = useState(false);
  const [resetConfigConfirmOpen, setResetConfigConfirmOpen] = useState(false);
  const [resetConfigBusy, setResetConfigBusy] = useState(false);
  const [reinstallConfirmOpen, setReinstallConfirmOpen] = useState(false);
  const [reinstallBusy, setReinstallBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dshHomeFocused, setDshHomeFocused] = useState(false);
  const dshHomePath = runtime?.dshHome ?? runtime?.effectiveDshHome ?? "";
  const dshHomeDefault =
    settings.dshHomeOverride.trim() ||
    dshHomePath ||
    undefined;
  const dshHomeDisplay =
    dshHomeFocused || !settings.dshHomeOverride.trim()
      ? settings.dshHomeOverride
      : shortenPathForDisplay(settings.dshHomeOverride);

  const onBrowseDshHome = useCallback(async () => {
    if (locked) return;
    try {
      const picked = await shellApi.pickDirectory(dshHomeDefault);
      if (!picked) return;
      patchRuntime(
        { dshHomeOverride: picked },
        { softHint: t("settings.data.dshHome.saved") },
      );
    } catch (e) {
      shellLog.error("settings", "pickDirectory", e);
    }
  }, [dshHomeDefault, locked, patchRuntime, t]);

  const runResetConfig = useCallback(async () => {
    setError(null);
    setResetConfigBusy(true);
    setResetConfigConfirmOpen(false);
    onCloseSettings?.();
    onBeginHarnessOp?.();
    life.beginOps(t("boot.msg.resettingConfig"));
    try {
      const ready = await shellApi.resetDshHome();
      refreshRuntime();
      onHarnessReady?.(ready);
      showToast(t("settings.data.resetConfig.done"));
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      onHarnessOpFailed?.(msg);
    } finally {
      life.endOps({ clearProgress: true });
      setResetConfigBusy(false);
    }
  }, [
    life,
    onBeginHarnessOp,
    onCloseSettings,
    onHarnessOpFailed,
    onHarnessReady,
    refreshRuntime,
    setError,
    showToast,
    t,
  ]);

  const runReinstallDsh = useCallback(async () => {
    setError(null);
    setReinstallBusy(true);
    setReinstallConfirmOpen(false);
    onCloseSettings?.();
    onBeginHarnessOp?.();
    life.beginOps(t("boot.msg.reinstalling"));
    try {
      const ready = await shellApi.reinstallDsh();
      refreshRuntime();
      onHarnessReady?.(ready);
      showToast(t("settings.data.reinstallDsh.done"));
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      onHarnessOpFailed?.(msg);
    } finally {
      life.endOps({ clearProgress: true });
      setReinstallBusy(false);
    }
  }, [
    life,
    onBeginHarnessOp,
    onCloseSettings,
    onHarnessOpFailed,
    onHarnessReady,
    refreshRuntime,
    setError,
    showToast,
    t,
  ]);

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
      <ShellConfirmDialog
        open={resetConfigConfirmOpen}
        titleKey="boot.resetConfig.confirmTitle"
        bodyKey="boot.resetConfig.confirm"
        bodyParams={{ path: dshHomePath || "—" }}
        busy={resetConfigBusy}
        onCancel={() => {
          if (!resetConfigBusy) setResetConfigConfirmOpen(false);
        }}
        onConfirm={() => void runResetConfig()}
      />
      <ShellConfirmDialog
        open={reinstallConfirmOpen}
        titleKey="boot.reinstallDsh.confirmTitle"
        bodyKey={
          installMode === "system"
            ? "boot.reinstallDsh.confirmSystem"
            : "boot.reinstallDsh.confirmHosted"
        }
        busy={reinstallBusy}
        onCancel={() => {
          if (!reinstallBusy) setReinstallConfirmOpen(false);
        }}
        onConfirm={() => void runReinstallDsh()}
      />

      <SettingsGroup title={t("settings.group.paths")}>
        <SettingsPrefRow
          title={t("settings.data.dshHome.title")}
          description={t("settings.data.dshHome.description")}
          layout="stack"
        >
          <div className="settings-path-input-wrap">
            <input
              className="settings-path-input mono shell-copyable"
              type="text"
              placeholder={t("settings.data.dshHome.placeholder")}
              value={dshHomeDisplay}
              disabled={locked}
              onFocus={() => setDshHomeFocused(true)}
              onBlur={() => setDshHomeFocused(false)}
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
            <div className="settings-path-input-actions">
              <ShellTooltip
                label={t("settings.data.dshHome.browse")}
                side="top"
                delayMs={300}
              >
                <button
                  type="button"
                  className="settings-path-icon-btn"
                  aria-label={t("settings.data.dshHome.browse")}
                  disabled={locked}
                  onClick={() => void onBrowseDshHome()}
                >
                  <IconFolderOpenOutline16 size={16} />
                </button>
              </ShellTooltip>
            </div>
          </div>
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
        >
          <button
            type="button"
            className="btn ghost"
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
          description={
            runtime?.cleanProfileActive
              ? `${t("settings.data.cleanProfile.description")} ${t("settings.data.cleanProfile.active")}`
              : t("settings.data.cleanProfile.description")
          }
        >
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
        </SettingsPrefRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.danger")} danger>
        <SettingsPrefRow
          title={t("settings.data.resetConfig.title")}
          description={t("settings.data.resetConfig.description")}
        >
          <button
            type="button"
            className="btn ghost"
            disabled={locked}
            onClick={() => setResetConfigConfirmOpen(true)}
          >
            {t("settings.data.resetConfig.button")}
          </button>
        </SettingsPrefRow>
        <SettingsPrefRow
          title={t("settings.data.reinstallDsh.title")}
          description={t("settings.data.reinstallDsh.description")}
        >
          <button
            type="button"
            className="btn ghost"
            disabled={locked}
            onClick={() => setReinstallConfirmOpen(true)}
          >
            {t("settings.data.reinstallDsh.button")}
          </button>
        </SettingsPrefRow>
      </SettingsGroup>
    </div>
  );
}
