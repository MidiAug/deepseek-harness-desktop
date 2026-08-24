/**
 * 经典占位顶栏：应用/帮助菜单 + 状态 + 窗控。
 */

import { useLocale } from "../../shell/locale";
import { WindowControls } from "./WindowControls";
import { TitleBarHostMenus } from "./TitleBarHostMenus";
import type { WinAction } from "./titlebarTypes";
import type { TitleConn } from "../../shell";

type Props = {
  port: number | null;
  conn: TitleConn;
  maximized: boolean;
  onOpenSettings: () => void;
  onRestart: () => void;
  onStop: () => void;
  onOpenDshHome: () => void;
  onOpenLogs: () => void;
  onHideToTray: () => void;
  onAbout: () => void;
  onCopyVersion: () => void;
  onOpenPlatform: () => void;
  onWin: (action: WinAction) => void;
};

export function ClassicTitleBar({
  port,
  conn,
  maximized,
  onOpenSettings,
  onRestart,
  onStop,
  onOpenDshHome,
  onOpenLogs,
  onHideToTray,
  onAbout,
  onCopyVersion,
  onOpenPlatform,
  onWin,
}: Props) {
  const { t } = useLocale();

  const statusLabel =
    conn === "connected" && port != null
      ? `:${port}`
      : conn === "error"
        ? t("chrome.conn.failed")
        : t("chrome.conn.preparing");

  const statusClass =
    conn === "connected"
      ? "is-ok"
      : conn === "error"
        ? "is-err"
        : "is-busy";

  return (
    <header className="titlebar">
      <TitleBarHostMenus
        onRestart={onRestart}
        onStop={onStop}
        onOpenDshHome={onOpenDshHome}
        onOpenLogs={onOpenLogs}
        onHideToTray={onHideToTray}
        onAbout={onAbout}
        onCopyVersion={onCopyVersion}
        onOpenPlatform={onOpenPlatform}
      />

      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={() => void onWin("maximize")}
      >
        <span className="titlebar-product" data-tauri-drag-region>
          {t("chrome.productName")}
        </span>
        <span className="titlebar-trail" data-tauri-drag-region>
          <span className="titlebar-dot" aria-hidden data-tauri-drag-region>
            ·
          </span>
          <span
            className={`titlebar-conn ${statusClass}`}
            data-tauri-drag-region
          >
            <span className="titlebar-conn-mark" aria-hidden />
            {statusLabel}
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
