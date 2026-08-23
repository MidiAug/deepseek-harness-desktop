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
  useChrome,
  useHarnessSettingsOps,
  useHostLifecycle,
  type ReadyPayload,
  type RuntimeStatus,
} from "../../shell";
import type { CliLinkStatus } from "../../shell/api/shellApi";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { useLocale, useSectionLabels } from "../../shell/locale";
import type { SettingsSection } from "./settingsTypes";
import { SettingsSectionNetwork } from "./SettingsSectionNetwork";
import { SettingsSectionWindow } from "./SettingsSectionWindow";
import { SettingsSectionAppearance } from "./SettingsSectionAppearance";
import { SettingsSectionRuntime } from "./SettingsSectionRuntime";
import { SettingsSectionData } from "./SettingsSectionData";
import { SettingsSectionAbout } from "./SettingsSectionAbout";
import { settingsNavIcon } from "./settingsNavIcon";
import { FaultRecoveryBlock } from "../chrome/FaultRecoveryBlock";
import type { FaultCta } from "../../shell/errors/recoveryMatrix";
import { blockModalSelectAll } from "../../shell/modalKeydown";

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
  onStopHarness?: () => void;
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

type PanelProps = {
  onClose: () => void;
  initialSection?: SettingsSection;
  onHarnessReady?: (payload: ReadyPayload) => void;
  onStopHarness?: () => void;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
  hint: string | null;
  flashHint: (msg: string) => void;
  fault: FaultState | null;
  reportFault: (
    message: string | null,
    retry?: () => void | Promise<void>,
  ) => void;
};

function SettingsModalPanel({
  onClose,
  initialSection,
  onHarnessReady,
  onStopHarness,
  runtime,
  refreshRuntime,
  hint,
  flashHint,
  fault,
  reportFault,
}: PanelProps) {
  const { setChrome, patchChrome, chrome } = useChrome();
  const { t } = useLocale();
  const sections = useSectionLabels();
  const life = useHostLifecycle();
  const { setUpdateCheck } = useHarnessSettingsOps();
  const [settings, setSettings] = useState<ShellSettings>(
    normalizeShellSettings(null),
  );
  const [cliStatus, setCliStatus] = useState<CliLinkStatus | null>(null);
  const [section, setSection] = useState<SettingsSection>(
    initialSection ?? "network",
  );
  const [portDraft, setPortDraft] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faultRef = useRef<FaultState | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  faultRef.current = fault;

  useEffect(() => {
    setUpdateCheck(null);
    setSection(initialSection ?? "network");
    void loadShellSettingsWithTheme()
      .then((next) => {
        setSettings(next);
        setPortDraft(
          next.preferredPort > 0 ? String(next.preferredPort) : "",
        );
        setChrome({
          shellTheme: next.shellTheme,
          titlebarCompact: next.titlebarCompact,
          selectionHygiene: next.selectionHygiene,
          sessionLogInTitlebar: next.sessionLogInTitlebar,
        });
      })
      .catch((e) => reportFault(String(e)));
    refreshRuntime();
    void shellApi.getCliLinkStatus().then(setCliStatus).catch(() => undefined);
  }, [initialSection, setChrome, refreshRuntime, setUpdateCheck, reportFault]);

  useEffect(() => {
    setSettings((s) =>
      s.shellTheme === chrome.shellTheme
        ? s
        : { ...s, shellTheme: chrome.shellTheme },
    );
  }, [chrome.shellTheme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      blockModalSelectAll(e);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    window.getSelection()?.removeAllRanges();
    modalRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
        case "reset":
          setSection("data");
          reportFault(null);
          break;
      }
    },
    [refreshRuntime, reportFault],
  );

  function persistRuntime(next: ShellSettings, softHint?: string) {
    reportFault(null);
    void shellApi
      .saveRuntimeSettings(runtimeFromSettings(next))
      .then(() => {
        if (softHint) flashHint(softHint);
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

  const compactOn = settings.titlebarCompact;
  const locked = life.locked;

  return (
    <div className="modal-backdrop settings-overlay" role="presentation">
      <button
        type="button"
        className="modal-mask"
        aria-label={t("settings.close")}
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
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

          <div className="settings-scroll">
            {section === "network" && (
              <SettingsSectionNetwork
                settings={settings}
                patchRuntime={patchRuntime}
              />
            )}
            {section === "window" && (
              <SettingsSectionWindow
                settings={settings}
                patchRuntime={patchRuntime}
              />
            )}
            {section === "appearance" && (
              <SettingsSectionAppearance
                settings={settings}
                compactOn={compactOn}
                patchAppearance={patchAppearance}
              />
            )}
            {section === "runtime" && (
              <SettingsSectionRuntime
                settings={settings}
                runtime={runtime}
                cliStatus={cliStatus}
                portDraft={portDraft}
                setPortDraft={setPortDraft}
                locked={locked}
                patchRuntime={patchRuntime}
                flashHint={flashHint}
                setError={reportFault}
                setSettings={setSettings}
                setCliStatus={setCliStatus}
                refreshRuntime={refreshRuntime}
                onStopHarness={onStopHarness}
              />
            )}
            {section === "data" && (
              <SettingsSectionData
                settings={settings}
                locked={locked}
                patchRuntime={patchRuntime}
                flashHint={flashHint}
                setError={reportFault}
                refreshRuntime={refreshRuntime}
                onHarnessReady={onHarnessReady}
              />
            )}
            {section === "about" && (
              <SettingsSectionAbout
                runtime={runtime}
                onDiagnosticsExported={(path) =>
                  flashHint(
                    t("settings.about.exportDiagnosticsDone", { path }),
                  )
                }
                onDiagnosticsError={reportFault}
              />
            )}

            {hint && (
              <p className="settings-live-hint settings-feedback">{hint}</p>
            )}
            {fault && (
              <FaultRecoveryBlock error={fault.message} onCta={handleFaultCta} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsModalOpen({
  onClose,
  initialSection,
  onHarnessReady,
  onStopHarness,
}: Omit<Props, "open">) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [fault, setFault] = useState<FaultState | null>(null);

  const refreshRuntime = useCallback(() => {
    void shellApi
      .getRuntimeStatus()
      .then(setRuntime)
      .catch(() => undefined);
  }, []);

  const flashHint = useCallback((msg: string) => {
    setHint(msg);
  }, []);

  const reportFault = useCallback(
    (message: string | null, retry?: () => void | Promise<void>) => {
      if (message === null) {
        setFault(null);
        setHint(null);
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
      flashHint={flashHint}
    >
      <SettingsModalPanel
        onClose={onClose}
        initialSection={initialSection}
        onHarnessReady={onHarnessReady}
        onStopHarness={onStopHarness}
        runtime={runtime}
        refreshRuntime={refreshRuntime}
        hint={hint}
        flashHint={flashHint}
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
  onStopHarness,
}: Props) {
  if (!open) return null;
  return (
    <SettingsModalOpen
      onClose={onClose}
      initialSection={initialSection}
      onHarnessReady={onHarnessReady}
      onStopHarness={onStopHarness}
    />
  );
}
