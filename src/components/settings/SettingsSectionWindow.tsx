import type { ShellSettings } from "../../shell/settings";
import { useLocale } from "../../shell/locale";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
};

export function SettingsSectionWindow({ settings, patchRuntime }: Props) {
  const { t } = useLocale();

  return (
    <div className="settings-section">
      <SettingsPrefRow
        title={t("settings.window.title")}
        description={t("settings.window.description")}
      >
        <button
          type="button"
          className={`settings-switch${settings.closeToTray ? " on" : ""}`}
          role="switch"
          aria-checked={settings.closeToTray}
          aria-label={t("settings.window.aria")}
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
          {t("settings.window.reask")}
        </button>
      </div>
    </div>
  );
}
