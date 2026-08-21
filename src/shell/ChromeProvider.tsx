/**
 * 壳 chrome 单源：顶栏外观不经 App ↔ Settings 双通道同步。
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
import {
  chromeFromSettings,
  type ChromePrefs,
  type ShellSettings,
} from "../shellSettings";
import * as shellApi from "./shellApi";

type ChromeContextValue = {
  chrome: ChromePrefs;
  /** 仅更新内存（打开设置时对齐磁盘） */
  setChrome: (chrome: ChromePrefs) => void;
  /** 外观即时落盘（只写 ui.json） */
  patchChrome: (
    patch: Partial<Pick<ShellSettings, "titlebarStyle" | "titlebarCompact">>,
  ) => void;
  /** 整份设置对齐后刷新 chrome 内存 */
  applyFromSettings: (s: ShellSettings) => void;
  refreshFromDisk: () => void;
};

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<ChromePrefs>({
    titlebarStyle: "black",
    titlebarCompact: false,
  });

  const refreshFromDisk = useCallback(() => {
    void shellApi
      .getShellSettings()
      .then((s) => setChrome(chromeFromSettings(s)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshFromDisk();
  }, [refreshFromDisk]);

  const applyFromSettings = useCallback((s: ShellSettings) => {
    setChrome(chromeFromSettings(s));
  }, []);

  const patchChrome = useCallback(
    (
      patch: Partial<Pick<ShellSettings, "titlebarStyle" | "titlebarCompact">>,
    ) => {
      setChrome((prev) => {
        const next: ChromePrefs = {
          titlebarStyle: patch.titlebarStyle ?? prev.titlebarStyle,
          titlebarCompact: patch.titlebarCompact ?? prev.titlebarCompact,
        };
        void shellApi.saveUiSettings(next).catch((e) => console.error(e));
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      chrome,
      setChrome,
      patchChrome,
      applyFromSettings,
      refreshFromDisk,
    }),
    [chrome, patchChrome, applyFromSettings, refreshFromDisk],
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
