import { useEffect, useState, type ComponentType } from "react";
import type { ShellTheme } from "../../shell/settings";
import { shellApi, useAppToast, useChrome, useSettingsPanelContext } from "../../shell";
import { LOCALE_OPTIONS, useLocale } from "../../shell/locale";
import {
  IconDarkOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
} from "../chrome/DshIcons";
import { ShellSelect } from "../chrome/ShellSelect";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPrefRow } from "./SettingsPrefRow";

export function SettingsSectionAppearance() {
  const { settings, patchRuntime, patchAppearance } = useSettingsPanelContext();
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
        <SettingsPrefRow title={t("settings.language.title")}>
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

        <SettingsPrefRow title={t("settings.theme.title")} layout="stack">
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
          <ShellSelect
            aria-label={t("settings.window.aria")}
            value={
              !settings.closePrefSet
                ? "ask"
                : settings.closeToTray
                  ? "tray"
                  : "quit"
            }
            options={[
              {
                value: "tray",
                label: t("settings.window.option.tray"),
              },
              {
                value: "quit",
                label: t("settings.window.option.quit"),
              },
              {
                value: "ask",
                label: t("settings.window.option.ask"),
              },
            ]}
            onChange={(v) => {
              if (v === "ask") {
                patchRuntime({
                  closePrefSet: false,
                  closePrefTouched: true,
                });
                showToast(t("settings.window.toastAsk"));
                return;
              }
              const toTray = v === "tray";
              patchRuntime({
                closeToTray: toTray,
                closePrefSet: true,
                closePrefTouched: true,
              });
              showToast(
                toTray
                  ? t("settings.window.toastTray")
                  : t("settings.window.toastQuit"),
              );
            }}
          />
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
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.editing")}>
        <SettingsPrefRow
          title={t("settings.hygiene.title")}
          description={t("settings.hygiene.description")}
        >
          <ShellTooltip
            label={t("settings.hygiene.descriptionTip")}
            side="top"
            delayMs={300}
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
          </ShellTooltip>
        </SettingsPrefRow>
      </SettingsGroup>
    </div>
  );
}
