import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  normalizeShellSettings,
  runtimeFromSettings,
  type ShellSettings,
} from "../../shell/settings";
import {
  shellApi,
  useChrome,
  useHostLifecycle,
  useShellUpdate,
  type HarnessUpdateCheck,
  type ReadyPayload,
  type RuntimeStatus,
} from "../../shell";
import type { CliLinkStatus } from "../../shell/api/shellApi";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { SECTIONS, type SettingsSection } from "./settingsTypes";
import { SettingsSectionNetwork } from "./SettingsSectionNetwork";
import { SettingsSectionWindow } from "./SettingsSectionWindow";
import { SettingsSectionAppearance } from "./SettingsSectionAppearance";
import { SettingsSectionRuntime } from "./SettingsSectionRuntime";
import { SettingsSectionData } from "./SettingsSectionData";
import { SettingsSectionAbout } from "./SettingsSectionAbout";

export type { SettingsSection } from "./settingsTypes";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 打开时定位到的分区（菜单「关于」→ about） */
  initialSection?: SettingsSection;
  /** harness 更新/重启成功后回灌会话 iframe */
  onHarnessReady?: (payload: ReadyPayload) => void;
  /** 停止托管进程 */
  onStopHarness?: () => void;
};

/** 居中两栏设置：几何对齐 DSH SettingsRoot；全部即时落盘。 */
export function SettingsModal({
  open,
  onClose,
  initialSection,
  onHarnessReady,
  onStopHarness,
}: Props) {
  const { setChrome, patchChrome, chrome } = useChrome();
  const life = useHostLifecycle();
  const shellUpd = useShellUpdate();
  const [settings, setSettings] = useState<ShellSettings>(
    normalizeShellSettings(null),
  );
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [cliStatus, setCliStatus] = useState<CliLinkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>("network");
  const [updateCheck, setUpdateCheck] = useState<HarnessUpdateCheck | null>(
    null,
  );
  const [portDraft, setPortDraft] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshRuntime = useCallback(() => {
    void shellApi
      .getRuntimeStatus()
      .then(setRuntime)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint(null);
    setUpdateCheck(null);
    setSection(initialSection ?? "network");
    void shellApi
      .getShellSettings()
      .then((s) => {
        const next = normalizeShellSettings(s);
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
      .catch((e) => setError(String(e)));
    refreshRuntime();
    void shellApi.getCliLinkStatus().then(setCliStatus).catch(() => undefined);
  }, [open, initialSection, setChrome, refreshRuntime]);

  // 官方 UI / yaml watch 改主题时，设置弹窗内选项跟着变
  useEffect(() => {
    if (!open) return;
    setSettings((s) =>
      s.shellTheme === chrome.shellTheme
        ? s
        : { ...s, shellTheme: chrome.shellTheme },
    );
  }, [chrome.shellTheme, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (life.logLines.length === 0) return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [life.logLines]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!open) return null;

  function flashHint(msg: string) {
    setHint(msg);
  }

  function persistRuntime(next: ShellSettings, softHint?: string) {
    setError(null);
    void shellApi
      .saveRuntimeSettings(runtimeFromSettings(next))
      .then(() => {
        if (softHint) flashHint(softHint);
      })
      .catch((e) => {
        setError(typeof e === "string" ? e : String(e));
        void shellApi.getShellSettings().then((s) => {
          setSettings(normalizeShellSettings(s));
        });
      });
  }

  /** 即时写 runtime 域；文本类可 debounce。 */
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

  async function onCheckUpdate() {
    setError(null);
    setHint(null);
    life.beginOps("正在检查更新…");
    try {
      const r = await shellApi.checkHarnessUpdate();
      setUpdateCheck(r);
      if (!r.updateAvailable) {
        flashHint("已是最新 harness。");
      } else {
        flashHint(
          `发现新版本 ${r.latest ?? "?"}（当前 ${r.local ?? "未安装"}），可点「更新并重启」。`,
        );
      }
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      life.endOps({
        clearProgress: true,
      });
    }
  }

  async function onApplyUpdate() {
    setError(null);
    setHint(null);
    life.beginOps("已开始更新：停止进程 → 安装 → 重启（可能需数分钟）…");
    try {
      const payload = await shellApi.applyHarnessUpdate();
      setUpdateCheck(null);
      refreshRuntime();
      onHarnessReady?.(payload);
      flashHint("harness 已更新并重启。");
      life.seedBoot({
        message: "更新完成",
        stageId: "start",
        percent: 100,
      });
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      refreshRuntime();
    } finally {
      life.endOps();
    }
  }

  async function onApplyNetworkRestart() {
    setError(null);
    setHint(null);
    life.beginOps("正在按当前网络设置重启 harness…");
    try {
      const payload = await shellApi.restartHarness();
      refreshRuntime();
      onHarnessReady?.(payload);
      flashHint("已按当前网络设置重启 harness。");
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      life.endOps({
        clearProgress: true,
      });
    }
  }

  const compactOn = settings.titlebarCompact;
  const locked = life.locked;
  // 仅 busy 或确有日志行；勿用 idle 残留 message（clear 后曾误出「正在准备」条）
  const showProgress = locked || life.logLines.length > 0;
  const barIndeterminate =
    locked && (life.percent == null || life.percent === 75);

  return (
    <div className="modal-backdrop settings-overlay" role="presentation">
      <button
        type="button"
        className="modal-mask"
        aria-label="关闭设置"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="settings-nav" aria-label="设置分区">
          <div className="settings-nav-title" id="settings-title">
            壳设置
          </div>
          <div className="settings-nav-list">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-nav-cell${section === s.id ? " active" : ""}`}
                aria-current={section === s.id ? "true" : undefined}
                onClick={() => {
                  setSection(s.id);
                  setHint(null);
                  setError(null);
                }}
              >
                <span className="settings-nav-label">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="settings-content">
          <div className="settings-content-head">
            <h2 className="settings-section-title">
              {SECTIONS.find((s) => s.id === section)?.label}
            </h2>
            <ShellTooltip label="关闭" delayMs={300}>
              <button
                type="button"
                className="settings-close"
                aria-label="关闭"
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
                setError={setError}
                setSettings={setSettings}
                setCliStatus={setCliStatus}
                refreshRuntime={refreshRuntime}
                onStopHarness={onStopHarness}
                onApplyNetworkRestart={onApplyNetworkRestart}
              />
            )}

            {section === "data" && (
              <SettingsSectionData
                settings={settings}
                locked={locked}
                patchRuntime={patchRuntime}
                flashHint={flashHint}
                setError={setError}
                refreshRuntime={refreshRuntime}
                onHarnessReady={onHarnessReady}
              />
            )}

            {section === "about" && (
              <SettingsSectionAbout
                runtime={runtime}
                locked={locked}
                showProgress={showProgress}
                barIndeterminate={barIndeterminate}
                life={{
                  message: life.message,
                  percent: life.percent,
                  logLines: life.logLines,
                }}
                logEndRef={logEndRef}
                updateCheck={updateCheck}
                shellUpd={shellUpd}
                onCheckUpdate={onCheckUpdate}
                onApplyUpdate={onApplyUpdate}
                onApplyNetworkRestart={onApplyNetworkRestart}
              />
            )}

            {hint && (
              <p className="settings-live-hint settings-feedback">{hint}</p>
            )}
            {error && <pre className="error">{error}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}
