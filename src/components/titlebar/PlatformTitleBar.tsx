/**
 * 平台态顶栏：返回 + 标题「DeepSeek 开放平台」+ 窗控。
 */

import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WindowControls } from "./WindowControls";
import type { WinAction } from "./titlebarTypes";

type Props = {
  maximized: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onWin: (action: WinAction) => void;
};

function startTitlebarDrag(e: MouseEvent) {
  if (e.button !== 0 || e.defaultPrevented) return;
  const el = e.target as HTMLElement;
  if (el.closest("button, a, input, select, textarea")) return;
  void getCurrentWindow().startDragging();
}

export function PlatformTitleBar({
  maximized,
  onBack,
  onOpenSettings,
  onWin,
}: Props) {
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <button
          type="button"
          className="menu-trigger titlebar-back"
          onClick={onBack}
        >
          ← 返回
        </button>
      </div>
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onMouseDown={startTitlebarDrag}
      >
        <span className="titlebar-product" data-tauri-drag-region>
          DeepSeek 开放平台
        </span>
      </div>
      <div className="titlebar-right">
        <WindowControls
          maximized={maximized}
          onOpenSettings={onOpenSettings}
          onWin={onWin}
        />
      </div>
    </header>
  );
}
