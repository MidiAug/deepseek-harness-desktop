import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  normalizeShellSettings,
  normalizeShellTheme,
  runtimeFromSettings,
  type ShellSettings,
} from "../../shell/settings";
import {
  HarnessSettingsOpsProvider,
  shellApi,
  shellLog,
  useAppToast,
  useChrome,
  useHarnessSettingsOps,
  useHarnessRecoveryActions,
  useHostLifecycle,
  SettingsPanelProvider,
  type ReadyPayload,
  type RuntimeStatus,
} from "../../shell";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { useLocale, useSectionLabels } from "../../shell/locale";
import type { SettingsSection } from "./settingsTypes";
import { normalizeSettingsSection } from "./settingsTypes";
import { SettingsSectionNetwork } from "./SettingsSectionNetwork";
import { SettingsSectionAppearance } from "./SettingsSectionAppearance";
import { SettingsSectionRuntime } from "./SettingsSectionRuntime";
import { SettingsSectionData } from "./SettingsSectionData";
import { SettingsSectionAbout } from "./SettingsSectionAbout";
import { settingsNavIcon } from "./settingsNavIcon";
import { FaultRecoveryBlock } from "../chrome/FaultRecoveryBlock";
import { HarnessRecoveryDialogs } from "../chrome/HarnessRecoveryDialogs";
import { ShellDialogFrame } from "../chrome/ShellDialogFrame";
import type { FaultCta } from "../../shell/errors/recoveryMatrix";
import { resolveInstallMode } from "../../shell/runtime/installMode";

export type { SettingsSection } from "./settingsTypes";

type FaultState = {
  message: string;
  retry?: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialSection?: SettingsSection;
  onHarnessReady?: (payload: ReadyPayload) => void;
  onBeginHarnessOp?: () => void;
  onHarnessOpFailed?: (message: string) => void;
  onStopHarness?: () => void | Promise<void>;
  onRestartHarness?: () => void;
};

type PanelProps = {
  onClose: () => void;
  initialSection?: SettingsSection;
  onHarnessReady?: (payload: ReadyPayload) => void;
  onBeginHarnessOp?: () => void;
  onHarnessOpFailed?: (message: string) => void;
  onStopHarness?: () => void | Promise<void>;
  onRestartHarness?: () => void;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void | Promise<void>;
  fault: FaultState | null;
  reportFault: (
    message: string | null,
    retry?: () => void | Promise<void>,
  ) => void;
};

async function loadShellSettingsWithTheme(): Promise<ShellSettings> {
  const [s, themePref] = await Promise.all([
    shellApi.getShellSettings(),
    shellApi.getDshThemePreference(),
  ]);
  return normalizeShellSettings({
    ...s,
    shellTheme: normalizeShellTheme(themePref || s.shellTheme),
  });
}

function SettingsModalPanel({
  onClose,
  initialSection,
  onHarnessReady,
  onBeginHarnessOp,
  onHarnessOpFailed,
  onStopHarness,
  onRestartHarness,
  runtime,
  refreshRuntime,
  fault,
  reportFault,
}: PanelProps) {
  const { setChrome, patchChrome, chrome } = useChrome();
  const { t } = useLocale();
  const sections = useSectionLabels();
  const life = useHostLifecycle();
  const { showToast } = useAppToast();
  const { setUpdateCheck } = useHarnessSettingsOps();
  const [settings, setSettings] = useState<ShellSettings>(
    normalizeShellSettings(null),
  );
  const [section, setSection] = useState<SettingsSection>(() =>
    normalizeSettingsSection(initialSection),
  );
  const [portDraft, setPortDraft] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faultRef = useRef<FaultState | null>(null);
  faultRef.current = fault;
  const setUpdateCheckRef = useRef(setUpdateCheck);
  setUpdateCheckRef.current = setUpdateCheck;
  const setChromeRef = useRef(setChrome);
  setChromeRef.current = setChrome;
  const reportFaultRef = useRef(reportFault);
  reportFaultRef.current = reportFault;
  const refreshRuntimeRef = useRef(refreshRuntime);
  refreshRuntimeRef.current = refreshRuntime;

  useEffect(() => {
    let cancelled = false;
    setUpdateCheckRef.current(null);
    setSection(normalizeSettingsSection(initialSection));
    void loadShellSettingsWithTheme()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setPortDraft(
          next.preferredPort > 0 ? String(next.preferredPort) : "",
        );
        setChromeRef.current({
          shellTheme: next.shellTheme,
          titlebarCompact: next.titlebarCompact,
          selectionHygiene: next.selectionHygiene,
          sessionLogInTitlebar: next.sessionLogInTitlebar,
        });
      })
      .catch((e) => {
        if (!cancelled) reportFaultRef.current(String(e));
      });
    refreshRuntimeRef.current();
    return () => {
      cancelled = true;
    };
  }, [initialSection]);

  useEffect(() => {
    setSettings((s) =>
      s.shellTheme === chrome.shellTheme
        ? s
        : { ...s, shellTheme: chrome.shellTheme },
    );
  }, [chrome.shellTheme]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const locked = life.locked;

  const installMode = resolveInstallMode({
    runtimeSource: settings.runtimeSource,
    activeRuntime: runtime?.activeRuntime,
  });

  const recovery = useHarnessRecoveryActions(
    "settings",
    {
      refreshRuntime,
      onHarnessReady,
      reportFault,
    },
    {
      installMode,
      dshHomePath: runtime?.dshHome ?? runtime?.effectiveDshHome ?? "",
    },
  );

  const handleFaultCta = useCallback(
    (cta: FaultCta) => {
      switch (cta) {
        case "retry": {
          const current = faultRef.current;
          reportFault(null);
          if (current?.retry) {
            void current.retry();
          } else {
            refreshRuntime();
          }
          break;
        }
        case "network":
          setSection("network");
          reportFault(null);
          break;
        case "logs":
          void shellApi.openKnownPath("logs");
          break;
        case "resetConfig":
          setSection("data");
          reportFault(null);
          break;
        case "reinstallDsh":
          setSection("data");
          reportFault(null);
          break;
        case "cleanProfile": {
          reportFault(null);
          recovery.request("cleanProfile");
          break;
        }
      }
    },
    [refreshRuntime, reportFault, recovery],
  );

  function persistRuntime(next: ShellSettings, softHint?: string) {
    reportFault(null);
    void shellApi
      .saveRuntimeSettings(runtimeFromSettings(next))
      .then(() => {
        if (softHint) showToast(softHint);
      })
      .catch((e) => {
        const msg = typeof e === "string" ? e : String(e);
        const snapshot = { ...next };
        reportFault(msg, () => persistRuntime(snapshot, softHint));
        void loadShellSettingsWithTheme()
          .then(setSettings)
          .catch(() => undefined);
      });
  }

  function patchRuntime(
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) {
    setSettings((s) => {
      const next = { ...s, ...patch };
      const delay = opts?.debounceMs ?? 0;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (delay > 0) {
        debounceRef.current = setTimeout(() => {
          persistRuntime(settingsRef.current, opts?.softHint);
        }, delay);
      } else {
        persistRuntime(next, opts?.softHint);
      }
      return next;
    });
  }

  function patchAppearance(
    patch: Partial<
      Pick<
        ShellSettings,
        | "shellTheme"
        | "titlebarCompact"
        | "selectionHygiene"
        | "sessionLogInTitlebar"
      >
    >,
  ) {
    setSettings((s) => ({ ...s, ...patch }));
    patchChrome(patch);
  }

  const panelContext = {
    settings,
    setSettings,
    runtime,
    refreshRuntime,
    locked,
    patchRuntime,
    patchAppearance,
    reportFault,
    portDraft,
    setPortDraft,
    onHarnessReady,
    onCloseSettings: onClose,
    onBeginHarnessOp,
    onHarnessOpFailed,
    onStopHarness,
    onRestartHarness,
    onDiagnosticsExported: (path: string) => {
      showToast(t("settings.about.exportDiagnosticsDone", { path }));
    },
    onDiagnosticsError: reportFault,
    fault,
    onFaultCta: handleFaultCta,
  };

  return (
    <>
      <ShellDialogFrame
        open
        onDismiss={onClose}
        className="settings-modal"
        backdropClassName="settings-overlay"
        aria-labelledby="settings-title"
      >
        <nav className="settings-nav" aria-label={t("settings.nav")}>
          <div className="settings-nav-title" id="settings-title">
            {t("settings.title")}
          </div>
          <div className="settings-nav-list">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-cell${section === s.id ? " active" : ""}`}
                aria-current={section === s.id ? "true" : undefined}
                onClick={() => {
                  setSection(s.id);
                  reportFault(null);
                }}
              >
                {settingsNavIcon(s.id)}
                <span className="settings-nav-label">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="settings-content">
          <div className="settings-content-head">
            <h2 className="settings-section-title">
              {sections.find((s) => s.id === section)?.label}
            </h2>
            <ShellTooltip label={t("settings.close")} delayMs={300}>
              <button
                type="button"
                className="settings-close"
                aria-label={t("settings.close")}
                onClick={onClose}
              >
                <span aria-hidden>×</span>
              </button>
            </ShellTooltip>
          </div>

          <SettingsPanelProvider value={panelContext}>
            {/* key=section：换分区重建滚动容器，避免保留 scrollTop */}
            <div className="settings-scroll" key={section}>
              {section === "appearance" && <SettingsSectionAppearance />}
              {section === "network" && <SettingsSectionNetwork />}
              {section === "runtime" && <SettingsSectionRuntime />}
              {section === "data" && <SettingsSectionData />}
              {section === "about" && <SettingsSectionAbout />}

              {fault && section !== "about" && (
                <FaultRecoveryBlock
                  error={fault.message}
                  installMode={installMode}
                  onCta={handleFaultCta}
                />
              )}
            </div>
          </SettingsPanelProvider>
        </div>
      </ShellDialogFrame>
      <HarnessRecoveryDialogs dialogs={recovery.dialogs} />
    </>
  );
}

function SettingsModalOpen({
  onClose,
  initialSection,
  onHarnessReady,
  onBeginHarnessOp,
  onHarnessOpFailed,
  onStopHarness,
  onRestartHarness,
}: Omit<Props, "open">) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [fault, setFault] = useState<FaultState | null>(null);
  const runtimeGenRef = useRef(0);

  const refreshRuntime = useCallback((): Promise<void> => {
    const gen = ++runtimeGenRef.current;
    return shellApi
      .getRuntimeStatus()
      .then((st) => {
        if (runtimeGenRef.current === gen) setRuntime(st);
      })
      .catch(() => undefined);
  }, []);

  const life = useHostLifecycle();
  const wasLockedRef = useRef(life.locked);
  useEffect(() => {
    const was = wasLockedRef.current;
    wasLockedRef.current = life.locked;
    // ops / boot 结束：强制刷新进程态，避免设置窗仍显示「处理中」
    if (was && !life.locked) {
      void refreshRuntime();
    }
  }, [life.locked, refreshRuntime]);

  const reportFault = useCallback(
    (message: string | null, retry?: () => void | Promise<void>) => {
      if (message === null) {
        setFault(null);
        return;
      }
      shellLog.warn("settings", message);
      setFault({ message, retry });
    },
    [],
  );

  return (
    <HarnessSettingsOpsProvider
      refreshRuntime={refreshRuntime}
      onHarnessReady={onHarnessReady}
      reportFault={reportFault}
    >
      <SettingsModalPanel
        onClose={onClose}
        initialSection={initialSection}
        onHarnessReady={onHarnessReady}
        onBeginHarnessOp={onBeginHarnessOp}
        onHarnessOpFailed={onHarnessOpFailed}
        onStopHarness={onStopHarness}
        onRestartHarness={onRestartHarness}
        runtime={runtime}
        refreshRuntime={refreshRuntime}
        fault={fault}
        reportFault={reportFault}
      />
    </HarnessSettingsOpsProvider>
  );
}

/** 居中两栏设置：几何对齐 DSH SettingsRoot；全部即时落盘。 */
export function SettingsModal({
  open,
  onClose,
  initialSection,
  onHarnessReady,
  onBeginHarnessOp,
  onHarnessOpFailed,
  onStopHarness,
  onRestartHarness,
}: Props) {
  if (!open) return null;
  return (
    <SettingsModalOpen
      onClose={onClose}
      initialSection={initialSection}
      onHarnessReady={onHarnessReady}
      onBeginHarnessOp={onBeginHarnessOp}
      onHarnessOpFailed={onHarnessOpFailed}
      onStopHarness={onStopHarness}
      onRestartHarness={onRestartHarness}
    />
  );
}
