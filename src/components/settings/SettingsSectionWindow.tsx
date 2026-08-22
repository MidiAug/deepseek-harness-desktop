import type { ShellSettings } from "../../shell/settings";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
};

export function SettingsSectionWindow({ settings, patchRuntime }: Props) {
  return (
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
  );
}
