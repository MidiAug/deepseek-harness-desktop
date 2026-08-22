/**
 * 平台内嵌态顶栏：返回 + 标题「DeepSeek开放平台」+ 窗控。
 */

import { WindowControls } from "./WindowControls";
import type { ChromePrefs } from "../../shell/settings";
import type { WinAction } from "./titlebarTypes";

type Props = {
  chrome: ChromePrefs;
  maximized: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onWin: (action: WinAction) => void;
};

export function PlatformTitleBar({
  chrome,
  maximized,
  onBack,
  onOpenSettings,
  onWin,
}: Props) {
  const barClass = [
    "titlebar",
    `titlebar-style-${chrome.titlebarStyle}`,
  ].join(" ");

  return (
    <header className={barClass}>
      <div className="titlebar-left">
        <button
          type="button"
          className="menu-trigger titlebar-back"
          onClick={onBack}
        >
          ← 返回
        </button>
      </div>
      <div className="titlebar-drag" data-tauri-drag-region>
        <span className="titlebar-status" data-tauri-drag-region>
          <span className="titlebar-product" data-tauri-drag-region>
            DeepSeek开放平台
          </span>
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
