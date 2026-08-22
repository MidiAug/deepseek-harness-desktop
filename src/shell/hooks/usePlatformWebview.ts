import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ResolvedTheme } from "../settings";
import { hidePlatformWebview, showPlatformWebview } from "../api/shellApi";

/** 平台态：在 shell-body 区域挂载原生子 WebView（站点禁止 iframe 嵌套）。 */
export function usePlatformWebview(
  active: boolean,
  shellBodyEl: HTMLDivElement | null,
  theme: ResolvedTheme,
) {
  useEffect(() => {
    if (!active || !shellBodyEl) {
      void hidePlatformWebview().catch((e: unknown) => console.error(e));
      return;
    }

    let cancelled = false;
    let unresized: (() => void) | undefined;
    let unscaled: (() => void) | undefined;

    const sync = () => {
      if (cancelled) return;
      const top = shellBodyEl.getBoundingClientRect().top;
      if (top < 0) return;
      void showPlatformWebview({ top, theme })
        .catch((e: unknown) => console.error(e));
    };

    const scheduleSync = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(sync);
      });
    };

    const w = getCurrentWindow();
    scheduleSync();
    const ro = new ResizeObserver(scheduleSync);
    ro.observe(shellBodyEl);
    void w.onResized(() => scheduleSync()).then((fn) => {
      unresized = fn;
    });
    void w.onScaleChanged(() => scheduleSync()).then((fn) => {
      unscaled = fn;
    });

    return () => {
      cancelled = true;
      ro.disconnect();
      unresized?.();
      unscaled?.();
      void hidePlatformWebview().catch((e: unknown) => console.error(e));
    };
  }, [active, shellBodyEl, theme]);
}
