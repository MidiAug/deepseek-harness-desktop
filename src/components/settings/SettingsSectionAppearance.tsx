import type { ComponentType } from "react";
import type { ShellSettings, ShellTheme } from "../../shell/settings";
import { LOCALE_OPTIONS, useLocale } from "../../shell/locale";
import {
  IconDarkOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
} from "../chrome/DshIcons";
import { ShellSelect } from "../chrome/ShellSelect";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  compactOn: boolean;
  patchAppearance: (
    patch: Partial<
      Pick<
        ShellSettings,
        | "shellTheme"
        | "titlebarCompact"
        | "selectionHygiene"
        | "sessionLogInTitlebar"
      >
    >,
  ) => void;
};

export function SettingsSectionAppearance({
  settings,
  compactOn,
  patchAppearance,
}: Props) {
  const { locale, setLocale, t } = useLocale();
  const hygieneOn = settings.selectionHygiene;
  const sessionLogOn = settings.sessionLogInTitlebar;

  const themeCubes: {
    id: ShellTheme;
    label: string;
    Icon: ComponentType<{ size?: number; className?: string }>;
  }[] = [
    { id: "light", label: t("settings.theme.light"), Icon: IconLightOutline16 },
    { id: "dark", label: t("settings.theme.dark"), Icon: IconDarkOutline16 },
    {
      id: "system",
      label: t("settings.theme.system"),
      Icon: IconFollowsystemOutline16,
    },
  ];

  return (
    <div className="settings-section appearance-panel">
      <SettingsPrefRow
        title={t("settings.language.title")}
        description={t("settings.language.description")}
      >
        <ShellSelect
          aria-label={t("settings.language.aria")}
          value={locale}
          options={LOCALE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          onChange={(v) => setLocale(v as typeof locale)}
        />
      </SettingsPrefRow>

      <SettingsPrefRow
        title={t("settings.theme.title")}
        description={t("settings.theme.description")}
        layout="stack"
      >
        <div
          className="settings-theme-cubes"
          role="radiogroup"
          aria-label={t("settings.theme.aria")}
        >
          {themeCubes.map(({ id, label, Icon }) => {
            const selected = settings.shellTheme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`settings-theme-cube${selected ? " on" : ""}`}
                onClick={() => patchAppearance({ shellTheme: id })}
              >
                <Icon />
                {label}
              </button>
            );
          })}
        </div>
      </SettingsPrefRow>

      <SettingsPrefRow
        title={t("settings.compact.title")}
        description={t("settings.compact.description")}
      >
        <button
          type="button"
          className={`settings-switch${compactOn ? " on" : ""}`}
          role="switch"
          aria-checked={compactOn}
          aria-label={t("settings.compact.aria")}
          onClick={() =>
            patchAppearance({ titlebarCompact: !compactOn })
          }
        >
          <span className="settings-switch-knob" />
        </button>
      </SettingsPrefRow>

      <SettingsPrefRow
        title={t("settings.sessionLog.title")}
        description={
          compactOn
            ? t("settings.sessionLog.descriptionOn")
            : t("settings.sessionLog.descriptionOff")
        }
        disabled={!compactOn}
      >
        <button
          type="button"
          className={`settings-switch${sessionLogOn ? " on" : ""}`}
          role="switch"
          aria-checked={sessionLogOn}
          aria-label={t("settings.sessionLog.aria")}
          disabled={!compactOn}
          onClick={() =>
            patchAppearance({ sessionLogInTitlebar: !sessionLogOn })
          }
        >
          <span className="settings-switch-knob" />
        </button>
      </SettingsPrefRow>

      <SettingsPrefRow
        title={t("settings.hygiene.title")}
        description={t("settings.hygiene.description")}
      >
        <button
          type="button"
          className={`settings-switch${hygieneOn ? " on" : ""}`}
          role="switch"
          aria-checked={hygieneOn}
          aria-label={t("settings.hygiene.aria")}
          onClick={() =>
            patchAppearance({ selectionHygiene: !hygieneOn })
          }
        >
          <span className="settings-switch-knob" />
        </button>
      </SettingsPrefRow>
    </div>
  );
}
