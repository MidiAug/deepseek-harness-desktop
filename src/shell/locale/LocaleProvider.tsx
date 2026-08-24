import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import * as shellApi from "../api/shellApi";
import { shellLog } from "../logger";
import { dicts, type LocaleKey } from "./dict";
import { detectBrowserLocale, prefToLocale } from "./detect";
import { DOCUMENT_LANG, type ShellLocale } from "./types";

export type SettingsSectionId =
  | "appearance"
  | "network"
  | "runtime"
  | "data"
  | "about";

type LocaleContextValue = {
  locale: ShellLocale;
  setLocale: (locale: ShellLocale) => void;
  t: (key: LocaleKey, params?: Record<string, string>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyDocumentLang(locale: ShellLocale) {
  document.documentElement.lang = DOCUMENT_LANG[locale];
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<ShellLocale>(() =>
    detectBrowserLocale(),
  );

  const t = useCallback(
    (key: LocaleKey, params?: Record<string, string>) => {
      let text = dicts[locale][key] ?? dicts.en[key] ?? key;
      if (params) {
        for (const [name, value] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${name}\\}`, "g"), value);
        }
      }
      return text;
    },
    [locale],
  );

  useEffect(() => {
    applyDocumentLang(locale);
    void shellApi.syncTrayLocale(locale).catch(() => undefined);
  }, [locale]);

  const refreshFromDisk = useCallback(() => {
    void shellApi
      .getDshLocalePreference()
      .then((pref) => {
        const fromYaml = prefToLocale(pref);
        if (fromYaml) setLocaleState(fromYaml);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshFromDisk();
  }, [refreshFromDisk]);

  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<string>("dsh-locale-changed", (ev) => {
      const next = prefToLocale(ev.payload);
      if (next) setLocaleState(next);
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  const setLocale = useCallback((next: ShellLocale) => {
    setLocaleState(next);
    void shellApi.setDshLocalePreference(next).catch((e) => shellLog.error("locale", "set preference", e));
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale 须在 LocaleProvider 内使用");
  }
  return ctx;
}

export function useSectionLabels(): {
  id: SettingsSectionId;
  label: string;
}[] {
  const { t } = useLocale();
  return useMemo(
    () => [
      { id: "appearance", label: t("settings.section.appearance") },
      { id: "network", label: t("settings.section.network") },
      { id: "runtime", label: t("settings.section.runtime") },
      { id: "data", label: t("settings.section.data") },
      { id: "about", label: t("settings.section.about") },
    ],
    [t],
  );
}
