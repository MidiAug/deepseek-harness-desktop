import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  useHostLifecycle,
  useShellUpdate,
  type HarnessUpdateCheck,
  type ReadyPayload,
  type RuntimeStatus,
} from "../shell";
import type { CliLinkStatus } from "../shell/shellApi";
import { ShellTooltip } from "./ShellTooltip";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect } from "./ShellSelect";

export type SettingsSection =
  | "network"
  | "window"
  | "appearance"
  | "runtime"
  | "data"
  | "about";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "network", label: "网络" },
  { id: "window", label: "窗口" },
  { id: "appearance", label: "外观" },
  { id: "runtime", label: "运行时" },
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
  const { setChrome, patchChrome } = useChrome();
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
          titlebarStyle: next.titlebarStyle,
          titlebarCompact: next.titlebarCompact,
        });
      })
      .catch((e) => setError(String(e)));
    refreshRuntime();
    void shellApi.getCliLinkStatus().then(setCliStatus).catch(() => undefined);
  }, [open, initialSection, setChrome, refreshRuntime]);

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
    patch: Partial<Pick<ShellSettings, "titlebarStyle" | "titlebarCompact">>,
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

            {section === "runtime" && (
              <div className="settings-section">
                <SettingsPrefRow
                  title="首选端口"
                  description="0 或留空 = 壳默认（开发 3081 / 发行 3080）；被占用时自动顺延。改后需重启 harness。"
                  layout="stack"
                >
                  <input
                    className="settings-control"
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="默认"
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
                        {
                          softHint:
                            "首选端口已保存；请在下方重启 harness 后生效。",
                        },
                      );
                    }}
                  />
                </SettingsPrefRow>
                <SettingsPrefRow title="当前端口" description="实际监听端口（可能因占用顺延）">
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
                        () => flashHint("已复制服务 URL。"),
                        () => setError("复制失败"),
                      );
                    }}
                  >
                    复制服务 URL
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!runtime?.port}
                    onClick={() => {
                      const url = `http://127.0.0.1:${runtime?.port}`;
                      void shellApi
                        .openLoopbackUrl(url)
                        .then(() => flashHint("已在浏览器打开。"))
                        .catch((e) => setError(String(e)));
                    }}
                  >
                    浏览器打开
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={locked}
                    onClick={() => {
                      onStopHarness?.();
                      flashHint("已请求停止 harness。");
                      refreshRuntime();
                    }}
                  >
                    停止 harness
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={locked}
                    onClick={() => void onApplyNetworkRestart()}
                  >
                    重启 harness
                  </button>
                </div>

                <SettingsPrefRow
                  title="命令行 dsh"
                  description="在 AppData/bin 写入 dsh.cmd 并加入用户 PATH（不修改 .bashrc/.zshrc）。新开终端生效。"
                >
                  <button
                    type="button"
                    className={`settings-switch${settings.cliLinkEnabled ? " on" : ""}`}
                    role="switch"
                    aria-checked={settings.cliLinkEnabled}
                    aria-label="命令行 dsh"
                    disabled={locked}
                    onClick={() => {
                      const next = !settings.cliLinkEnabled;
                      setSettings((s) => ({ ...s, cliLinkEnabled: next }));
                      void shellApi
                        .setCliLinkEnabled(next)
                        .then((st) => {
                          setCliStatus(st);
                          flashHint(
                            next
                              ? "已启用 CLI；请新开终端验证 dsh。"
                              : "已关闭 CLI 并移出用户 PATH。",
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
                    shim {cliStatus.shimExists ? "已写入" : "未写入"}
                    {" · "}
                    PATH {cliStatus.pathRegistered ? "已注册" : "未注册"}
                    {cliStatus.binDir ? ` · ${cliStatus.binDir}` : ""}
                  </p>
                )}
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
                <SettingsPrefRow
                  title="重置托管运行时"
                  description="清除 AppData 下的 harness 并重新安装；保留已下载的 Node；不会删除 DSH_HOME / ~/.dsh 会话与插件"
                  layout="stack"
                >
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={locked}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "将清除本机托管的 harness 安装并重新下载（保留 Node；不删除 ~/.dsh）。继续？",
                        )
                      ) {
                        return;
                      }
                      setError(null);
                      void (async () => {
                        try {
                          const ready = await shellApi.resetHostedRuntime();
                          flashHint("托管运行时已重置并重新启动。");
                          refreshRuntime();
                          onHarnessReady?.(ready);
                        } catch (e) {
                          setError(typeof e === "string" ? e : String(e));
                        }
                      })();
                    }}
                  >
                    重置托管运行时
                  </button>
                </SettingsPrefRow>
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
                            (locked ? "安装中…" : "未安装")}
                        </span>
                        {runtime?.harnessReady ? (
                          <span className="settings-pill ok">就绪</span>
                        ) : locked ? (
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

                {updateCheck && !locked && (
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
                        {life.message ||
                          (locked ? "处理中…" : "最近进度")}
                      </span>
                      {life.percent != null && !barIndeterminate && (
                        <span className="settings-progress-pct">
                          {life.percent}%
                        </span>
                      )}
                    </div>
                    <div
                      className={`settings-progress-bar${barIndeterminate ? " indeterminate" : ""}`}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        barIndeterminate
                          ? undefined
                          : (life.percent ?? undefined)
                      }
                    >
                      <div
                        className="settings-progress-fill"
                        style={
                          barIndeterminate
                            ? undefined
                            : { width: `${life.percent ?? 0}%` }
                        }
                      />
                    </div>
                    {life.logLines.length > 0 && (
                      <div className="settings-log" aria-label="更新日志">
                        {life.logLines.map((line, i) => (
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

                {!locked && (
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
                  {shellUpd.phase === "downloaded"
                    ? `壳 ${shellUpd.version ?? ""} 已下载，可立即重启安装。`
                    : shellUpd.phase === "downloading"
                      ? `正在下载壳更新${shellUpd.percent != null ? ` ${shellUpd.percent}%` : "…"}`
                      : shellUpd.phase === "unsupported"
                        ? "壳更新：开发态或未配置发行端点时不可用；发行构建将自动检查（启动后 / 每 6 小时），下完再提示安装。"
                        : "壳更新：启动后与每 6 小时自动检查；有新版本后台下载，确认后重启安装。详细进度写入 AppData/logs/shell.log。"}
                </p>
                <div className="settings-cell-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={
                      shellUpd.phase === "checking" ||
                      shellUpd.phase === "downloading" ||
                      shellUpd.phase === "installing"
                    }
                    onClick={() => void shellUpd.checkNow(true)}
                  >
                    检查壳更新
                  </button>
                  {shellUpd.phase === "downloaded" && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => void shellUpd.installAndRelaunch()}
                    >
                      立即重启安装壳
                    </button>
                  )}
                </div>
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
