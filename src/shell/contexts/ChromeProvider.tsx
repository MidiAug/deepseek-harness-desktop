/**
 * 壳 chrome：主题真源 = DSH settings.yaml；文件 watch 推送；ui.json 只管简洁/洁净等。
 */

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
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  chromeFromSettings,
  normalizeShellSettings,
  normalizeShellTheme,
  type ChromePrefs,
  type ResolvedTheme,
  type ShellSettings,
  type ShellTheme,
} from "../settings";
import * as shellApi from "../api/shellApi";
import { shellLog } from "../logger";

type ChromePatch = Partial<
  Pick<
    ShellSettings,
    | "shellTheme"
    | "titlebarCompact"
    | "selectionHygiene"
    | "sessionLogInTitlebar"
  >
>;

type ChromeContextValue = {
  chrome: ChromePrefs;
  resolvedTheme: ResolvedTheme;
  setChrome: (chrome: ChromePrefs) => void;
  patchChrome: (patch: ChromePatch) => void;
  applyFromSettings: (s: ShellSettings) => void;
  refreshFromDisk: () => void;
};

const ChromeContext = createContext<ChromeContextValue | null>(null);

function osPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
}

function resolveTheme(theme: ShellTheme, osDark: boolean): ResolvedTheme {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return osDark ? "dark" : "light";
}

function applyDomTheme(theme: ResolvedTheme) {
  document.documentElement.setAttribute("data-shell-theme", theme);
}

function prefToTheme(p: string): ShellTheme {
  if (p === "light" || p === "dark" || p === "system") return p;
  if (p === "follow") return "system";
  return "system";
}

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<ChromePrefs>({
    shellTheme: "system",
    titlebarCompact: false,
    selectionHygiene: false,
    sessionLogInTitlebar: true,
  });
  const [osDark, setOsDark] = useState(() => osPrefersDark());

  const resolvedTheme = useMemo(
    () => resolveTheme(chrome.shellTheme, osDark),
    [chrome.shellTheme, osDark],
  );

  useEffect(() => {
    applyDomTheme(resolvedTheme);
    void getCurrentWindow()
      .setTheme(resolvedTheme)
      .catch(() => undefined);
  }, [resolvedTheme]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onOs = () => setOsDark(mq.matches);
    mq.addEventListener?.("change", onOs);
    return () => mq.removeEventListener?.("change", onOs);
  }, []);

  const refreshFromDisk = useCallback(() => {
    void Promise.all([
      shellApi.getShellSettings(),
      shellApi.getDshThemePreference(),
    ])
      .then(([s, themePref]) => {
        const ui = chromeFromSettings(normalizeShellSettings(s));
        setChrome({
          ...ui,
          shellTheme: normalizeShellTheme(themePref || ui.shellTheme),
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshFromDisk();
  }, [refreshFromDisk]);

  // DSH yaml 变更（官方 UI 或壳写入）→ 事件，无轮询
  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<string>("dsh-theme-changed", (ev) => {
      const next = prefToTheme(ev.payload);
      setChrome((prev) =>
        prev.shellTheme === next ? prev : { ...prev, shellTheme: next },
      );
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  const applyFromSettings = useCallback((s: ShellSettings) => {
    setChrome(chromeFromSettings(s));
  }, []);

  const patchChrome = useCallback((patch: ChromePatch) => {
    setChrome((prev) => {
      const next: ChromePrefs = {
        shellTheme: patch.shellTheme ?? prev.shellTheme,
        titlebarCompact: patch.titlebarCompact ?? prev.titlebarCompact,
        selectionHygiene: patch.selectionHygiene ?? prev.selectionHygiene,
        sessionLogInTitlebar:
          patch.sessionLogInTitlebar ?? prev.sessionLogInTitlebar,
      };
      if (patch.shellTheme != null) {
        void shellApi
          .setDshThemePreference(patch.shellTheme)
          .catch((e) => shellLog.error("chrome", "set theme", e));
      }
      const uiOnly = {
        titlebarCompact: next.titlebarCompact,
        selectionHygiene: next.selectionHygiene,
        sessionLogInTitlebar: next.sessionLogInTitlebar,
      };
      if (
        patch.titlebarCompact != null ||
        patch.selectionHygiene != null ||
        patch.sessionLogInTitlebar != null
      ) {
        void shellApi.saveUiSettings(uiOnly).catch((e) => shellLog.error("chrome", "save ui", e));
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      chrome,
      resolvedTheme,
      setChrome,
      patchChrome,
      applyFromSettings,
      refreshFromDisk,
    }),
    [chrome, resolvedTheme, patchChrome, applyFromSettings, refreshFromDisk],
  );

  return (
    <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
  );
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) {
    throw new Error("useChrome 须在 ChromeProvider 内使用");
  }
  return ctx;
}
