import type { Dispatch, SetStateAction } from "react";
import type { ShellSettings } from "../../shell/settings";
import { shellApi, type RuntimeStatus } from "../../shell";
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
  setError: Dispatch<SetStateAction<string | null>>;
  setSettings: Dispatch<SetStateAction<ShellSettings>>;
  setCliStatus: Dispatch<SetStateAction<CliLinkStatus | null>>;
  refreshRuntime: () => void;
  onStopHarness?: () => void;
  onApplyNetworkRestart: () => void | Promise<void>;
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
  onApplyNetworkRestart,
}: Props) {
  return (
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
  );
}
