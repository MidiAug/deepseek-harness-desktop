import type { DesktopZone, TextEditAction } from "./types";

/** 输入框复制不 toast；正文复制 toast */
export function shouldShowCopyToast(zone: DesktopZone): boolean {
  return zone === "content";
}

/** 复制后是否清选区 */
export function shouldClearSelectionAfterCopy(zone: DesktopZone): boolean {
  return zone === "content";
}

/** 粘贴是否必须在壳侧 readText 再 insert（跨帧无 user activation） */
export function pasteViaShellClipboard(zone: DesktopZone): boolean {
  return zone === "input";
}

export function isTextEditAction(action: string): action is TextEditAction {
  return (
    action === "undo" ||
    action === "redo" ||
    action === "cut" ||
    action === "copy" ||
    action === "paste" ||
    action === "selectAll"
  );
}

export function isSidebarAction(
  action: string,
): action is "rename" | "fork" | "archive" | "delete" {
  return (
    action === "rename" ||
    action === "fork" ||
    action === "archive" ||
    action === "delete"
  );
}
