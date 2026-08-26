import { useCallback, useState } from "react";
import {
  shellApi,
  shellLog,
  useAppToast,
  useHarnessRecoveryActions,
  useSettingsPanelContext,
} from "../../shell";
import { shortenPathForDisplay } from "../../shell/formatPathShort";
import { useLocale } from "../../shell/locale";
import { resolveInstallMode } from "../../shell/runtime/installMode";
import { HarnessRecoveryDialogs } from "../chrome/HarnessRecoveryDialogs";
import { IconFolderOpenOutline16 } from "../chrome/DshIcons";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";

function PathOpenRow({
  which,
  title,
  description,
  pathHint,
  openLabel,
  openTip,
}: {
  which: "dshHome" | "appData" | "logs";
  title: string;
  description: string;
  pathHint?: string;
  openLabel: string;
  openTip: string;
}) {
  return (
    <SettingsPrefRow title={title} description={description} layout="stack">
      {pathHint ? (
        <p className="settings-path-hint mono shell-copyable">{pathHint}</p>
      ) : null}
      <ShellTooltip label={openTip} side="top" delayMs={300}>
        <button
          type="button"
          className="btn ghost"
          aria-label={openTip}
          onClick={() => void shellApi.openKnownPath(which)}
        >
          {openLabel}
        </button>
      </ShellTooltip>
    </SettingsPrefRow>
  );
}

export function SettingsSectionData() {
  const {
    settings,
    runtime,
    locked,
    patchRuntime,
    reportFault,
    refreshRuntime,
    onHarnessReady,
    onCloseSettings,
    onBeginHarnessOp,
    onHarnessOpFailed,
    onDiagnosticsExported,
    onDiagnosticsError,
  } = useSettingsPanelContext();
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const installMode = resolveInstallMode({
    runtimeSource: settings.runtimeSource,
    activeRuntime: runtime?.activeRuntime,
  });
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

  const recovery = useHarnessRecoveryActions(
    "settings",
    {
      refreshRuntime,
      onHarnessReady,
      onCloseSettings,
      onBeginHarnessOp,
      onHarnessOpFailed,
      reportFault,
    },
    { installMode, dshHomePath },
  );

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
      <HarnessRecoveryDialogs dialogs={recovery.dialogs} />

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
          openTip={t("settings.data.path.openTip")}
        />
        <PathOpenRow
          which="appData"
          title={t("settings.data.path.appDataTitle")}
          description={
            runtime?.appDataOccupied
              ? `${t("settings.data.path.appDataDesc")} ${t("settings.data.path.appDataOccupied")}`
              : runtime?.appDataAdjusted
                ? `${t("settings.data.path.appDataDesc")} ${t("settings.data.path.appDataAdjusted")}`
                : t("settings.data.path.appDataDesc")
          }
          pathHint={
            (runtime?.appDataAdjusted || runtime?.appDataOccupied) && runtime.appData
              ? shortenPathForDisplay(runtime.appData)
              : undefined
          }
          openLabel={t("settings.data.path.open")}
          openTip={t("settings.data.path.openTip")}
        />
        <PathOpenRow
          which="dshHome"
          title={t("settings.data.path.dshHomeTitle")}
          description={t("settings.data.path.dshHomeDesc")}
          openLabel={t("settings.data.path.open")}
          openTip={t("settings.data.path.openTip")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.diagnostics")}>
        <SettingsPrefRow
          title={t("settings.about.exportDiagnostics")}
          description={t("settings.data.diagnostics.hint")}
        >
          <ShellTooltip
            label={t("settings.about.exportDiagnosticsTip")}
            side="top"
            delayMs={300}
          >
            <button
              type="button"
              className="btn ghost"
              aria-label={t("settings.about.exportDiagnosticsTip")}
              disabled={locked || exporting}
              onClick={() => void onExportDiagnostics()}
            >
              {t("settings.about.exportDiagnosticsAction")}
            </button>
          </ShellTooltip>
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
            <ShellTooltip
              label={t("settings.data.cleanProfile.exitTip")}
              side="top"
              delayMs={300}
            >
              <button
                type="button"
                className="btn ghost"
                aria-label={t("settings.data.cleanProfile.exitTip")}
                disabled={locked}
                onClick={() => {
                  const runExit = async () => {
                    reportFault(null);
                    try {
                      const ready = await shellApi.exitCleanProfile();
                      showToast(t("settings.data.cleanProfile.exitDone"));
                      refreshRuntime();
                      onHarnessReady?.(ready);
                    } catch (e) {
                      const msg = typeof e === "string" ? e : String(e);
                      reportFault(msg, runExit);
                    }
                  };
                  void runExit();
                }}
              >
                {t("settings.data.cleanProfile.exit")}
              </button>
            </ShellTooltip>
          ) : (
            <ShellTooltip
              label={t("settings.data.cleanProfile.startTip")}
              side="top"
              delayMs={300}
            >
              <button
                type="button"
                className="btn ghost"
                aria-label={t("settings.data.cleanProfile.startTip")}
                disabled={locked}
                onClick={() => recovery.request("cleanProfile")}
              >
                {t("settings.data.cleanProfile.start")}
              </button>
            </ShellTooltip>
          )}
        </SettingsPrefRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.danger")} danger>
        <SettingsPrefRow
          title={t("settings.data.resetConfig.title")}
          description={t("settings.data.resetConfig.description")}
        >
          <ShellTooltip
            label={t("settings.data.resetConfig.buttonTip")}
            side="top"
            delayMs={300}
          >
            <button
              type="button"
              className="btn ghost"
              aria-label={t("settings.data.resetConfig.buttonTip")}
              disabled={locked}
              onClick={() => recovery.request("resetConfig")}
            >
              {t("settings.data.resetConfig.button")}
            </button>
          </ShellTooltip>
        </SettingsPrefRow>
        <SettingsPrefRow
          title={t("settings.data.reinstallDsh.title")}
          description={t("settings.data.reinstallDsh.description")}
        >
          <ShellTooltip
            label={t("settings.data.reinstallDsh.buttonTip")}
            side="top"
            delayMs={300}
          >
            <button
              type="button"
              className="btn ghost"
              aria-label={t("settings.data.reinstallDsh.buttonTip")}
              disabled={locked}
              onClick={() => recovery.request("reinstallDsh")}
            >
              {t("settings.data.reinstallDsh.button")}
            </button>
          </ShellTooltip>
        </SettingsPrefRow>
      </SettingsGroup>
    </div>
  );
}
