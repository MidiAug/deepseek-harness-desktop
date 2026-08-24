import { useEffect, useState, type ComponentType } from "react";
import type { ShellSettings, ShellTheme } from "../../shell/settings";
import { shellApi, useAppToast, useChrome } from "../../shell";
import { LOCALE_OPTIONS, useLocale } from "../../shell/locale";
import {
  IconDarkOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
} from "../chrome/DshIcons";
import { ShellSelect } from "../chrome/ShellSelect";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
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
  patchRuntime,
  patchAppearance,
}: Props) {
  const { locale, setLocale, t } = useLocale();
  const { showToast } = useAppToast();
  const { chrome } = useChrome();
  const compactOn = chrome.titlebarCompact;
  const hygieneOn = chrome.selectionHygiene;
  const sessionLogOn = chrome.sessionLogInTitlebar;
  const [autostartOn, setAutostartOn] = useState(false);
  const [autostartReady, setAutostartReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void shellApi
      .getAutostartEnabled()
      .then((on) => {
        if (!cancelled) {
          setAutostartOn(on);
          setAutostartReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAutostartReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <SettingsGroup title={t("settings.group.sync")}>
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
              const selected = chrome.shellTheme === id;
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
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.shellChrome")}>
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
          title={t("settings.window.title")}
          description={t("settings.window.description")}
        >
          <button
            type="button"
            className={`settings-switch${settings.closeToTray ? " on" : ""}`}
            role="switch"
            aria-checked={settings.closeToTray}
            aria-label={t("settings.window.aria")}
            onClick={() => {
              const next = !settings.closeToTray;
              patchRuntime({
                closeToTray: next,
                closePrefSet: true,
              });
              showToast(
                next
                  ? t("settings.window.toastTray")
                  : t("settings.window.toastQuit"),
              );
            }}
          >
            <span className="settings-switch-knob" />
          </button>
        </SettingsPrefRow>
        <SettingsPrefRow
          title={t("settings.autostart.title")}
          description={t("settings.autostart.description")}
        >
          <button
            type="button"
            className={`settings-switch${autostartOn ? " on" : ""}`}
            role="switch"
            aria-checked={autostartOn}
            aria-label={t("settings.autostart.aria")}
            disabled={!autostartReady}
            onClick={() => {
              const next = !autostartOn;
              setAutostartOn(next);
              void shellApi
                .setAutostartEnabled(next)
                .then(() => {
                  showToast(
                    next
                      ? t("settings.autostart.toastOn")
                      : t("settings.autostart.toastOff"),
                  );
                })
                .catch(() => {
                  setAutostartOn(!next);
                  showToast(t("settings.autostart.toastFail"));
                });
            }}
          >
            <span className="settings-switch-knob" />
          </button>
        </SettingsPrefRow>
        <div className="settings-cell-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              patchRuntime({ closePrefSet: false });
              showToast(t("settings.window.reaskDone"));
            }}
          >
            {t("settings.window.reask")}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.editing")}>
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
      </SettingsGroup>
    </div>
  );
}
