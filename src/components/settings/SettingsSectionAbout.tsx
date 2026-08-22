import type { RefObject } from "react";
import {
  shellApi,
  type HarnessUpdateCheck,
  type RuntimeStatus,
  type ShellUpdateState,
} from "../../shell";

type LifeSlice = {
  message: string;
  percent: number | null;
  logLines: string[];
};

type ShellUpdSlice = Pick<
  ShellUpdateState,
  "phase" | "version" | "percent"
> & {
  checkNow: (force?: boolean) => void | Promise<void>;
  installAndRelaunch: () => void | Promise<void>;
};

type Props = {
  runtime: RuntimeStatus | null;
  locked: boolean;
  showProgress: boolean;
  barIndeterminate: boolean;
  life: LifeSlice;
  logEndRef: RefObject<HTMLDivElement | null>;
  updateCheck: HarnessUpdateCheck | null;
  shellUpd: ShellUpdSlice;
  onCheckUpdate: () => void | Promise<void>;
  onApplyUpdate: () => void | Promise<void>;
  onApplyNetworkRestart: () => void | Promise<void>;
};

export function SettingsSectionAbout({
  runtime,
  locked,
  showProgress,
  barIndeterminate,
  life,
  logEndRef,
  updateCheck,
  shellUpd,
  onCheckUpdate,
  onApplyUpdate,
  onApplyNetworkRestart,
}: Props) {
  return (
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

      <div className="settings-cell-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            void shellApi.openPlatformWindow().catch((e) => console.error(e));
          }}
        >
          打开 DeepSeek API 平台
        </button>
      </div>
      <p className="settings-live-hint">
        在主窗口内嵌打开 platform.deepseek.com；顶栏可返回官方 UI。若页面空白，可能是站点禁止嵌套，请改用系统浏览器访问。
      </p>

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
  );
}
