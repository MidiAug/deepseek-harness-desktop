import type { ShellSettings } from "../../shell/settings";
import { shellApi, type ReadyPayload } from "../../shell";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  locked: boolean;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
  flashHint: (msg: string) => void;
  setError: (error: string | null) => void;
  refreshRuntime: () => void;
  onHarnessReady?: (payload: ReadyPayload) => void;
};

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

export function SettingsSectionData({
  settings,
  locked,
  patchRuntime,
  flashHint,
  setError,
  refreshRuntime,
  onHarnessReady,
}: Props) {
  return (
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
  );
}
