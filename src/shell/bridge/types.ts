/** B49 — 桌面语义桥：壳 ↔ iframe 统一消息与策略 */

export type DesktopZone = "input" | "content" | "workspace" | "session";

export type TextEditAction =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll";

export type SidebarAction = "rename" | "fork" | "archive" | "delete";

export type DesktopAction =
  | { kind: "textEdit"; action: TextEditAction; text?: string }
  | { kind: "contentCopy"; action: "copy" | "selectAll" }
  | { kind: "sidebar"; action: SidebarAction }
  | { kind: "legacyMenu"; action: string };

export type ShellToHarnessMessage =
  | { source: "dsh-shell"; type: "desktop-action" } & DesktopAction
  | { source: "dsh-shell"; type: "context-menu-action"; action: string }
  | { source: "dsh-shell"; type: "clear-selection" }
  | { source: "dsh-shell"; type: "selection-hygiene"; enabled: boolean }
  | { source: "dsh-shell"; type: "shell-modal-open"; open: boolean }
  | { source: "dsh-shell"; type: "shell-select-all" }
  | { source: "dsh-shell"; type: "session-log-proxy"; enabled: boolean }
  | { source: "dsh-shell"; type: "session-log-click" }
  | { source: "dsh-shell"; type: "session-log-dismiss-dialog" };

export type MenuOpenContext = {
  zone: DesktopZone;
  selectedText?: string;
  shellTarget?: HTMLElement;
};
