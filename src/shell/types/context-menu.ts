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

/** iframe 注入诊断：选区/复制等用户操作（无正文，仅枚举与长度） */
export type HarnessInjectDiag = {
  source: "dsh-shell-context-menu" | "dsh-shell-inject";
  type: "diag";
  /** 如 copy / select-all / hygiene / menu-action */
  event: string;
  /** 扁平字段：zone、selLen、ok、home、via 等 */
  [key: string]: string | number | boolean | undefined;
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
