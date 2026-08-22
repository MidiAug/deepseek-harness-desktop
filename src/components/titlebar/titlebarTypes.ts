import type { ChromePrefs } from "../../shell/settings";
import type { TitleConn } from "../../shell";

export type ShellTitleBarProps = {
  port: number | null;
  conn: TitleConn;
  chrome: ChromePrefs;
  /** 简洁叠层：官方 UI 侧栏宽（px），由 WebView 注入上报 */
  sidebarWidthPx: number;
  onOpenSettings: () => void;
  onRestart: () => void;
  onStop: () => void;
  onOpenDshHome: () => void;
  onOpenLogs: () => void;
  onHideToTray: () => void;
  onAbout: () => void;
  onCopyVersion: () => void;
};

export type WinAction = "minimize" | "maximize" | "close";
