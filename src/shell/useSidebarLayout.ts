/** 侧栏几何：WebView init 注入 → postMessage（跨源唯一可靠通道）。 */

import { useEffect, useState } from "react";
import type { SidebarLayout } from "./ipc-types";

const SIDEBAR_MSG = "dsh-shell-sidebar-probe";
/** 尚未收到注入上报时的展开态回退宽 */
export const SIDEBAR_FALLBACK_PX = 260;

export function useSidebarLayout(iframeKey: number) {
  const [sidebar, setSidebar] = useState<SidebarLayout | null>(null);

  // iframe 换 key 时清掉旧几何，避免错位叠层
  useEffect(() => {
    setSidebar(null);
  }, [iframeKey]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as {
        source?: string;
        ok?: boolean;
        widthPx?: number | null;
        collapsed?: boolean;
      } | null;
      if (!data || data.source !== SIDEBAR_MSG || !data.ok) return;
      const w = data.widthPx;
      if (typeof w !== "number" || !Number.isFinite(w) || w < 8) return;
      const next: SidebarLayout = {
        widthPx: Math.round(w),
        collapsed: data.collapsed === true,
      };
      setSidebar((prev) => {
        if (
          prev &&
          prev.widthPx === next.widthPx &&
          prev.collapsed === next.collapsed
        ) {
          return prev;
        }
        return next;
      });
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return {
    sidebar,
    sidebarWidthPx: sidebar?.widthPx ?? SIDEBAR_FALLBACK_PX,
    resetSidebar: () => setSidebar(null),
  };
}
