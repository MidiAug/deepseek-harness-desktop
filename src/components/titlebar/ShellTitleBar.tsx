/**
 * 顶栏路由：平台内嵌 / classic / compact。
 */

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ClassicTitleBar } from "./ClassicTitleBar";
import { CompactTitleBar } from "./CompactTitleBar";
import { PlatformTitleBar } from "./PlatformTitleBar";
import type { ShellTitleBarProps, WinAction } from "./titlebarTypes";

export type { ShellTitleBarProps, ShellBodyView } from "./titlebarTypes";

export function ShellTitleBar({
  port,
  conn,
  chrome,
  sidebarWidthPx,
  bodyView,
  onBackFromPlatform,
  onOpenSettings,
  onSessionLog,
  onRestart,
  onStop,
  onOpenDshHome,
  onOpenLogs,
  onHideToTray,
  onAbout,
  onCopyVersion,
  onOpenPlatform,
}: ShellTitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const compact = chrome.titlebarCompact;

  useEffect(() => {
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    async function syncMaximized() {
      try {
        const next = await w.isMaximized();
        if (!cancelled) setMaximized(next);
      } catch {
        /* 开发态偶发 IPC 未就绪，忽略 */
      }
    }

    void syncMaximized();
    void w
      .onResized(() => {
        void syncMaximized();
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  async function onWin(action: WinAction) {
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "maximize") {
      await w.toggleMaximize();
      setMaximized(await w.isMaximized());
    } else await w.close();
  }

  if (bodyView === "platform") {
    return (
      <PlatformTitleBar
        chrome={chrome}
        maximized={maximized}
        onBack={onBackFromPlatform}
        onOpenSettings={onOpenSettings}
        onWin={onWin}
      />
    );
  }

  if (compact) {
    return (
      <CompactTitleBar
        sidebarWidthPx={sidebarWidthPx}
        maximized={maximized}
        showSessionLog={chrome.sessionLogInTitlebar}
        onSessionLog={onSessionLog}
        onOpenSettings={onOpenSettings}
        onWin={onWin}
      />
    );
  }

  return (
    <ClassicTitleBar
      port={port}
      conn={conn}
      chrome={chrome}
      maximized={maximized}
      onOpenSettings={onOpenSettings}
      onRestart={onRestart}
      onStop={onStop}
      onOpenDshHome={onOpenDshHome}
      onOpenLogs={onOpenLogs}
      onHideToTray={onHideToTray}
      onAbout={onAbout}
      onCopyVersion={onCopyVersion}
      onOpenPlatform={onOpenPlatform}
      onWin={onWin}
    />
  );
}
