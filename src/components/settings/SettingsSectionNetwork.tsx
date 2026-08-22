import type { MirrorKind, ProxyMode, ShellSettings } from "../../shell/settings";
import { useLocale } from "../../shell/locale";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { ShellSelect } from "../chrome/ShellSelect";

type Props = {
  settings: ShellSettings;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
};

export function SettingsSectionNetwork({ settings, patchRuntime }: Props) {
  const { t } = useLocale();

  const mirrorOptions = [
    { value: "domestic", label: t("settings.mirror.domestic") },
    { value: "official", label: t("settings.mirror.official") },
  ];

  const proxyOptions = [
    { value: "off", label: t("settings.proxy.off") },
    { value: "system", label: t("settings.proxy.system") },
    { value: "custom", label: t("settings.proxy.custom") },
  ];

  return (
    <div className="settings-section">
      <SettingsPrefRow
        title={t("settings.mirror.title")}
        description={t("settings.mirror.description")}
      >
        <ShellSelect
          aria-label={t("settings.mirror.aria")}
          value={settings.mirror}
          options={mirrorOptions}
          onChange={(v) =>
            patchRuntime(
              { mirror: v as MirrorKind },
              { softHint: t("settings.mirror.saved") },
            )
          }
        />
      </SettingsPrefRow>

      <SettingsPrefRow
        title={t("settings.proxy.title")}
        description={t("settings.proxy.description")}
      >
        <ShellSelect
          aria-label={t("settings.proxy.aria")}
          value={settings.proxyMode}
          options={proxyOptions}
          onChange={(v) =>
            patchRuntime(
              { proxyMode: v as ProxyMode },
              { softHint: t("settings.proxy.saved") },
            )
          }
        />
      </SettingsPrefRow>

      {settings.proxyMode === "custom" && (
        <SettingsPrefRow
          title={t("settings.proxyUrl.title")}
          description={t("settings.proxyUrl.description")}
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
                  softHint: t("settings.proxyUrl.saved"),
                },
              )
            }
          />
        </SettingsPrefRow>
      )}
    </div>
  );
}
