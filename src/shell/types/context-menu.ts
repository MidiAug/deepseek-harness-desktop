import type { TextEditAction } from "../textEditActions";

/** iframe → 壳：右键菜单打开请求 */
export type HarnessContextMenuZone =
  | "workspace"
  | "session"
  | "input"
  | "content";

export type HarnessContextMenuOpen = {
  source: "dsh-shell-context-menu";
  type: "open";
  zone: HarnessContextMenuZone;
  x: number;
  y: number;
};

export type HarnessContextMenuClose = {
  source: "dsh-shell-context-menu";
  type: "close";
};

export type HarnessContextMenuCopied = {
  source: "dsh-shell-context-menu";
  type: "copied";
};

export type SidebarContextMenuAction = "rename" | "fork" | "archive" | "delete";

export type HarnessContextMenuAction = SidebarContextMenuAction | TextEditAction;

export type ShellContextMenuState = {
  zone: HarnessContextMenuZone;
  x: number;
  y: number;
  /** 壳层输入框：本地 execCommand，不经 iframe */
  shellTarget?: HTMLElement;
} | null;
