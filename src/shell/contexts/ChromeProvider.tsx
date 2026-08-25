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

/** 首屏同步读，避免默认 classic → 异步加载 compact 造成顶栏占位跳动 */
const TITLEBAR_COMPACT_CACHE_KEY = "dsh.shell.titlebarCompact";

function readCachedTitlebarCompact(): boolean {
  try {
    return localStorage.getItem(TITLEBAR_COMPACT_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCachedTitlebarCompact(compact: boolean) {
  try {
    localStorage.setItem(TITLEBAR_COMPACT_CACHE_KEY, compact ? "1" : "0");
  } catch {
    /* private mode 等忽略 */
  }
}

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
  const [chrome, setChromeState] = useState<ChromePrefs>({
    shellTheme: "system",
    titlebarCompact: readCachedTitlebarCompact(),
    selectionHygiene: false,
    sessionLogInTitlebar: true,
  });
  const [osDark, setOsDark] = useState(() => osPrefersDark());

  const setChrome = useCallback((next: ChromePrefs) => {
    writeCachedTitlebarCompact(next.titlebarCompact);
    setChromeState(next);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(chrome.shellTheme, osDark),
    [chrome.shellTheme, osDark],
  );

  // 跟随系统：用 Tauri theme() / onThemeChanged（WebView 内 matchMedia 会被 setTheme 污染）
  useEffect(() => {
    const win = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const syncSystemTheme = async () => {
      if (chrome.shellTheme !== "system") return;
      try {
        await win.setTheme(null);
        const t = await win.theme();
        if (!cancelled && (t === "light" || t === "dark")) {
          setOsDark(t === "dark");
        }
      } catch {
        if (!cancelled) setOsDark(osPrefersDark());
      }
    };

    if (chrome.shellTheme === "system") {
      void syncSystemTheme();
      void win
        .onThemeChanged(({ payload }) => {
          if (payload === "light" || payload === "dark") {
            setOsDark(payload === "dark");
          }
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [chrome.shellTheme]);

  useEffect(() => {
    applyDomTheme(resolvedTheme);
    const win = getCurrentWindow();
    if (chrome.shellTheme === "system") {
      void win.setTheme(null).catch(() => undefined);
    } else {
      void win.setTheme(resolvedTheme).catch(() => undefined);
    }
  }, [resolvedTheme, chrome.shellTheme]);

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
  }, [setChrome]);

  useEffect(() => {
    refreshFromDisk();
  }, [refreshFromDisk]);

  // DSH yaml 变更（官方 UI 或壳写入）→ 事件，无轮询
  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<string>("dsh-theme-changed", (ev) => {
      const next = prefToTheme(ev.payload);
      setChromeState((prev) =>
        prev.shellTheme === next ? prev : { ...prev, shellTheme: next },
      );
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  const applyFromSettings = useCallback(
    (s: ShellSettings) => {
      setChrome(chromeFromSettings(s));
    },
    [setChrome],
  );

  const patchChrome = useCallback((patch: ChromePatch) => {
    setChromeState((prev) => {
      const next: ChromePrefs = {
        shellTheme: patch.shellTheme ?? prev.shellTheme,
        titlebarCompact: patch.titlebarCompact ?? prev.titlebarCompact,
        selectionHygiene: patch.selectionHygiene ?? prev.selectionHygiene,
        sessionLogInTitlebar:
          patch.sessionLogInTitlebar ?? prev.sessionLogInTitlebar,
      };
      writeCachedTitlebarCompact(next.titlebarCompact);
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
        void shellApi
          .saveUiSettings(uiOnly)
          .catch((e) => shellLog.error("chrome", "save ui", e));
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
    [chrome, resolvedTheme, setChrome, patchChrome, applyFromSettings, refreshFromDisk],
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
