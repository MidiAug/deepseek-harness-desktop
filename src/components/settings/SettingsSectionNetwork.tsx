import type { MirrorKind, ProxyMode, ShellSettings } from "../../shell/settings";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect } from "../chrome/ShellSelect";
import { MIRROR_OPTIONS, PROXY_OPTIONS } from "./settingsTypes";

type Props = {
  settings: ShellSettings;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
};

export function SettingsSectionNetwork({ settings, patchRuntime }: Props) {
  return (
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
  );
}
