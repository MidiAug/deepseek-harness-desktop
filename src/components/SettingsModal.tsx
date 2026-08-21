import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  normalizeShellSettings,
  runtimeFromSettings,
  type MirrorKind,
  type ProxyMode,
  type ShellSettings,
  type TitlebarStyle,
} from "../shellSettings";
import {
  shellApi,
  useChrome,
  type HarnessUpdateCheck,
  type ProgressPayload,
  type ReadyPayload,
  type RuntimeStatus,
} from "../shell";
import { ShellTooltip } from "./ShellTooltip";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect } from "./ShellSelect";

export type SettingsSection =
  | "network"
  | "window"
  | "appearance"
  | "data"
  | "about";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "network", label: "网络" },
  { id: "window", label: "窗口" },
  { id: "appearance", label: "外观" },
  { id: "data", label: "数据与诊断" },
  { id: "about", label: "关于" },
];

const STYLE_OPTIONS: { id: TitlebarStyle; label: string; hint: string }[] = [
  { id: "black", label: "黑色", hint: "#1b1b1c" },
  { id: "gray", label: "灰色", hint: "旧顶栏" },
];

const MIRROR_OPTIONS = [
  { value: "domestic", label: "国内（npmmirror）" },
  { value: "official", label: "官方（nodejs.org / npmjs）" },
];

const PROXY_OPTIONS = [
  { value: "off", label: "关闭（直连）" },
  { value: "system", label: "系统代理" },
  { value: "custom", label: "自定义 URL" },
];

const LOG_CAP = 200;

type Props = {
  open: boolean;
  onClose: () => void;
  /** 打开时定位到的分区（菜单「关于」→ about） */
  initialSection?: SettingsSection;
  /** harness 更新/重启成功后回灌会话 iframe */
  onHarnessReady?: (payload: ReadyPayload) => void;
  /** 冷启动安装 / 拉起中：关于区隐藏更新类操作 */
  hostLifecycleBusy?: boolean;
};

/** 居中两栏设置：几何对齐 DSH SettingsRoot；全部即时落盘。 */
export function SettingsModal({
  open,
  onClose,
  initialSection,
  onHarnessReady,
  hostLifecycleBusy = false,
}: Props) {
  const { setChrome, patchChrome } = useChrome();
  const [settings, setSettings] = useState<ShellSettings>(
    normalizeShellSettings(null),
  );
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>("network");
  const [updateCheck, setUpdateCheck] = useState<HarnessUpdateCheck | null>(
    null,
  );
  /** 本页发起的检查 / 更新 / 重启 */
  const [opsBusy, setOpsBusy] = useState(false);
  /** 收到 install-progress（含首跑安装镜像进关于区） */
  const [hostProgressBusy, setHostProgressBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
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

  const pushLog = useCallback((line: string) => {
    const t = line.trim();
    if (!t) return;
    setLogLines((prev) => {
      const next =
        prev.length >= LOG_CAP
          ? prev.slice(prev.length - LOG_CAP + 1)
          : [...prev];
      next.push(t);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint(null);
    setUpdateCheck(null);
    setOpsBusy(false);
    setHostProgressBusy(hostLifecycleBusy);
    setProgressMsg(null);
    setProgressPct(null);
    setLogLines([]);
    setSection(initialSection ?? "network");
    void shellApi
      .getShellSettings()
      .then((s) => {
        const next = normalizeShellSettings(s);
        setSettings(next);
        setChrome({
          titlebarStyle: next.titlebarStyle,
          titlebarCompact: next.titlebarCompact,
        });
      })
      .catch((e) => setError(String(e)));
    refreshRuntime();
  }, [open, initialSection, setChrome, refreshRuntime, hostLifecycleBusy]);

  useEffect(() => {
    if (!open) return;
    if (hostLifecycleBusy) setHostProgressBusy(true);
    else if (!opsBusy) setHostProgressBusy(false);
  }, [open, hostLifecycleBusy, opsBusy]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let un: (() => void) | undefined;
    void listen<ProgressPayload>("install-progress", (ev) => {
      const { stage, message, percent } = ev.payload;
      setHostProgressBusy(true);
      pushLog(message);
      if (stage === "npm-log") {
        setProgressMsg(
          message.length > 120 ? `${message.slice(0, 119)}…` : message,
        );
        setProgressPct((p) => (p != null && p >= 75 ? p : 75));
        return;
      }
      setProgressMsg(message);
      if (percent != null) {
        setProgressPct(percent);
        if (percent >= 100) setHostProgressBusy(false);
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, [open, pushLog]);

  useEffect(() => {
    if (logLines.length === 0) return;
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logLines]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!open) return null;

  function flashHint(msg: string) {
    setHint(msg);
  }

  function beginBusy(initial: string) {
    setOpsBusy(true);
    setProgressMsg(initial);
    setProgressPct(null);
    setLogLines([initial]);
  }

  function endBusy(clearProgress: boolean) {
    setOpsBusy(false);
    if (clearProgress) {
      setProgressMsg(null);
      setProgressPct(null);
      setLogLines([]);
    }
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
    patch: Partial<Pick<ShellSettings, "titlebarStyle" | "titlebarCompact">>,
  ) {
    setSettings((s) => ({ ...s, ...patch }));
    patchChrome(patch);
  }

  async function onCheckUpdate() {
    setError(null);
    setHint(null);
    beginBusy("正在检查更新…");
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
      endBusy(true);
    }
  }

  async function onApplyUpdate() {
    setError(null);
    setHint(null);
    beginBusy("已开始更新：停止进程 → 安装 → 重启（可能需数分钟）…");
    setProgressPct(5);
    try {
      const payload = await shellApi.applyHarnessUpdate();
      setUpdateCheck(null);
      refreshRuntime();
      onHarnessReady?.(payload);
      flashHint("harness 已更新并重启。");
      setProgressPct(100);
      setProgressMsg("更新完成");
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      refreshRuntime();
      setProgressMsg(null);
      setProgressPct(null);
    } finally {
      setOpsBusy(false);
    }
  }

  async function onApplyNetworkRestart() {
    setError(null);
    setHint(null);
    beginBusy("正在按当前网络设置重启 harness…");
    try {
      const payload = await shellApi.restartHarness();
      refreshRuntime();
      onHarnessReady?.(payload);
      flashHint("已按当前网络设置重启 harness。");
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      endBusy(true);
    }
  }

  const compactOn = settings.titlebarCompact;
  /** 首跑安装 / 拉起 / 本页操作：关于区不提供更新类按钮 */
  const lifecycleLocked =
    hostLifecycleBusy || hostProgressBusy || opsBusy;
  const showProgress =
    lifecycleLocked || progressMsg != null || logLines.length > 0;
  const barIndeterminate =
    lifecycleLocked && (progressPct == null || progressPct === 75);

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
              <div className="settings-section">
                <SettingsPrefRow
                  title="镜像"
                  description="影响 Node 下载与 npm registry；下次安装或更新时生效"
                >
                  <ShellSelect
                    aria-label="镜像"
                    value={settings.mirror}
                    options={MIRROR_OPTIONS}
                    onChange={(v) =>
                      patchRuntime(
                        { mirror: v as MirrorKind },
                        {
                          softHint: "镜像已保存；下次安装或更新 harness 时生效。",
                        },
                      )
                    }
                  />
                </SettingsPrefRow>

                <SettingsPrefRow
                  title="代理"
                  description="作用于壳下载、npm 与托管 dsh 子进程"
                >
                  <ShellSelect
                    aria-label="代理"
                    value={settings.proxyMode}
                    options={PROXY_OPTIONS}
                    onChange={(v) =>
                      patchRuntime(
                        { proxyMode: v as ProxyMode },
                        {
                          softHint:
                            "代理已保存。运行中进程需在「关于」中重启以立即生效。",
                        },
                      )
                    }
                  />
                </SettingsPrefRow>

                {settings.proxyMode === "custom" && (
                  <SettingsPrefRow
                    title="代理 URL"
                    description="例如 http://127.0.0.1:7890 或 socks5://…"
                    layout="stack"
                  >
                    <input
                      className="settings-control"
                      type="text"
                      placeholder="http://127.0.0.1:7890"
                      value={settings.proxyUrl}
                      onChange={(ev) =>
                        patchRuntime(
                          { proxyUrl: ev.target.value },
                          {
                            debounceMs: 350,
                            softHint:
                              "代理 URL 已保存。运行中进程需重启以立即生效。",
                          },
                        )
                      }
                    />
                  </SettingsPrefRow>
                )}
              </div>
            )}

            {section === "window" && (
              <div className="settings-section">
                <SettingsPrefRow
                  title="关闭窗口时最小化到托盘"
                  description="关闭时会记住此选择；也可用下方按钮下次再询问"
                >
                  <button
                    type="button"
                    className={`settings-switch${settings.closeToTray ? " on" : ""}`}
                    role="switch"
                    aria-checked={settings.closeToTray}
                    aria-label="关闭窗口时最小化到托盘"
                    onClick={() =>
                      patchRuntime({
                        closeToTray: !settings.closeToTray,
                        closePrefSet: true,
                      })
                    }
                  >
                    <span className="settings-switch-knob" />
                  </button>
                </SettingsPrefRow>
                <div className="settings-cell-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => patchRuntime({ closePrefSet: false })}
                  >
                    下次关闭时重新询问
                  </button>
                </div>
              </div>
            )}

            {section === "appearance" && (
              <div className="settings-section appearance-panel">
                <SettingsPrefRow
                  title="简洁模式"
                  description="透明顶栏叠在官方 UI 上（左侧随侧栏、右侧可拖）；窗控悬停显现"
                >
                  <button
                    type="button"
                    className={`settings-switch${compactOn ? " on" : ""}`}
                    role="switch"
                    aria-checked={compactOn}
                    aria-label="简洁模式"
                    onClick={() =>
                      patchAppearance({ titlebarCompact: !compactOn })
                    }
                  >
                    <span className="settings-switch-knob" />
                  </button>
                </SettingsPrefRow>

                <SettingsPrefRow
                  title="顶栏颜色"
                  description={
                    compactOn
                      ? "简洁模式使用透明叠层顶栏，颜色设置不可用"
                      : "选择顶栏底色；改动立即生效"
                  }
                  layout="stack"
                  disabled={compactOn}
                >
                  <div
                    className="settings-style-grid"
                    role="radiogroup"
                    aria-label="顶栏颜色"
                  >
                    {STYLE_OPTIONS.map((opt) => {
                      const selected = settings.titlebarStyle === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={compactOn}
                          className={`settings-style-card${selected ? " on" : ""} style-${opt.id}`}
                          onClick={() =>
                            patchAppearance({ titlebarStyle: opt.id })
                          }
                        >
                          <span className={`style-preview ${opt.id}`} />
                          <span className="style-meta">
                            <span className="style-name">{opt.label}</span>
                            <span className="style-hint">{opt.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SettingsPrefRow>
              </div>
            )}

            {section === "data" && (
              <div className="settings-section">
                <SettingsPrefRow
                  title="DSH_HOME 覆盖"
                  description="留空 = ~/.dsh；下次启动 harness 时生效"
                  layout="stack"
                >
                  <input
                    className="settings-control"
                    type="text"
                    placeholder="例如 D:\data\dsh-home"
                    value={settings.dshHomeOverride}
                    onChange={(ev) =>
                      patchRuntime(
                        { dshHomeOverride: ev.target.value },
                        {
                          debounceMs: 350,
                          softHint: "DSH_HOME 覆盖已保存；下次启动生效。",
                        },
                      )
                    }
                  />
                </SettingsPrefRow>
                <div className="settings-cell-actions">
                  <PathButton which="dshHome" label="DSH_HOME" />
                  <PathButton which="appData" label="AppData" />
                  <PathButton which="logs" label="日志" />
                </div>
              </div>
            )}

            {section === "about" && (
              <div className="settings-section settings-about">
                <div className="settings-about-card">
                  <div className="settings-about-brand">
                    <span className="settings-about-name">
                      deepseek-harness-desktop
                    </span>
                    <span className="settings-about-tag">
                      DeepSeek Harness 桌面版
                    </span>
                  </div>
                  <dl className="settings-about-meta">
                    <div>
                      <dt>壳版本</dt>
                      <dd>{runtime?.shellVersion ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>harness</dt>
                      <dd>
                        <span className="settings-about-ver">
                          {runtime?.harnessVersion ??
                            (lifecycleLocked ? "安装中…" : "未安装")}
                        </span>
                        {runtime?.harnessReady ? (
                          <span className="settings-pill ok">就绪</span>
                        ) : lifecycleLocked ? (
                          <span className="settings-pill warn">进行中</span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>digest</dt>
                      <dd className="mono">{runtime?.harnessDigest ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>端口</dt>
                      <dd>{runtime?.port ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Node</dt>
                      <dd>
                        {runtime?.nodeReady ? (
                          <span className="settings-pill ok">就绪</span>
                        ) : (
                          <span className="settings-pill warn">未装</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>

                {updateCheck && !lifecycleLocked && (
                  <div
                    className={`settings-update-banner${updateCheck.updateAvailable ? " has-update" : ""}`}
                  >
                    <span>
                      本地 {updateCheck.local ?? "（未安装）"}
                      {updateCheck.latest
                        ? ` · registry ${updateCheck.latest}`
                        : ""}
                    </span>
                    <span className="settings-update-banner-flag">
                      {updateCheck.updateAvailable ? "有可用更新" : "已是最新"}
                    </span>
                  </div>
                )}

                {showProgress && (
                  <div
                    className="settings-progress-panel"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="settings-progress-head">
                      <span className="settings-progress-msg">
                        {progressMsg ??
                          (lifecycleLocked ? "处理中…" : "最近进度")}
                      </span>
                      {progressPct != null && !barIndeterminate && (
                        <span className="settings-progress-pct">
                          {progressPct}%
                        </span>
                      )}
                    </div>
                    <div
                      className={`settings-progress-bar${barIndeterminate ? " indeterminate" : ""}`}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        barIndeterminate ? undefined : (progressPct ?? undefined)
                      }
                    >
                      <div
                        className="settings-progress-fill"
                        style={
                          barIndeterminate
                            ? undefined
                            : { width: `${progressPct ?? 0}%` }
                        }
                      />
                    </div>
                    {logLines.length > 0 && (
                      <div className="settings-log" aria-label="更新日志">
                        {logLines.map((line, i) => (
                          <div
                            key={`${i}-${line.slice(0, 24)}`}
                            className="settings-log-line"
                          >
                            {line}
                          </div>
                        ))}
                        <div ref={logEndRef} />
                      </div>
                    )}
                  </div>
                )}

                {!lifecycleLocked && (
                  <div className="settings-cell-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void onCheckUpdate()}
                    >
                      检查 harness 更新
                    </button>
                    {updateCheck?.updateAvailable && (
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => void onApplyUpdate()}
                      >
                        更新并重启
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void onApplyNetworkRestart()}
                    >
                      应用网络设置并重启 harness
                    </button>
                  </div>
                )}

                <p className="settings-live-hint">
                  壳自身更新通道尚未启用。详细进度写入 AppData/logs/shell.log。
                </p>
              </div>
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

function PathButton({
  which,
  label,
}: {
  which: "dshHome" | "appData" | "logs";
  label: string;
}) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => void shellApi.openKnownPath(which)}
    >
      {label}
    </button>
  );
}
