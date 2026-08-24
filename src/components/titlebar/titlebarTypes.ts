import type { ChromePrefs } from "../../shell/settings";
import type { TitleConn } from "../../shell";

export type ShellBodyView = "harness" | "platform";

export type ShellTitleBarProps = {
  port: number | null;
  conn: TitleConn;
  /** 首跑向导等阶段隐藏顶栏「准备中」状态，避免与全屏引导重复 */
  hideConnStatus?: boolean;
  /** 首跑引导：仅标题 + 窗控 */
  minimal?: boolean;
  chrome: ChromePrefs;
  /** 简洁叠层：官方 UI 侧栏宽（px），由 WebView 注入上报 */
  sidebarWidthPx: number;
  bodyView: ShellBodyView;
  onBackFromPlatform: () => void;
  onOpenSettings: () => void;
  /** 简洁顶栏：代理点击官方 Session log */
  onSessionLog: () => void;
  /** iframe 上报：当前页是否存在 Session log 控件 */
  sessionLogAvailable: boolean;
  onRestart: () => void;
  onStop: () => void;
  onOpenDshHome: () => void;
  onOpenLogs: () => void;
  onHideToTray: () => void;
  onAbout: () => void;
  onCopyVersion: () => void;
  onOpenPlatform: () => void;
};

export type WinAction = "minimize" | "maximize" | "close";
