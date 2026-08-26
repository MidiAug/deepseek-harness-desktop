import {
  isSidebarAction,
  isTextEditAction,
  pasteViaShellClipboard,
} from "./policies.ts";
import type { MenuOpenContext, TextEditAction } from "./types.ts";

export type DispatchPlan =
  | { route: "noop" }
  | { route: "shell-input"; action: TextEditAction; readClipboard: boolean }
  | { route: "shell-copy"; zone: MenuOpenContext["zone"]; text: string }
  | {
      route: "iframe-desktop";
      action: TextEditAction;
      readClipboard: boolean;
    }
  | { route: "iframe-legacy"; action: string };

/**
 * 纯函数：根据菜单上下文决定走哪条管线（无副作用，可单测）。
 */
export function planDesktopDispatch(
  action: string,
  menu: MenuOpenContext | null,
): DispatchPlan {
  if (!menu) return { route: "noop" };

  if (menu.shellTarget) {
    if (!isTextEditAction(action)) return { route: "noop" };
    return {
      route: "shell-input",
      action,
      readClipboard: action === "paste",
    };
  }

  if (
    action === "copy" &&
    menu.selectedText &&
    (menu.zone === "content" || menu.zone === "input")
  ) {
    return {
      route: "shell-copy",
      zone: menu.zone,
      text: menu.selectedText,
    };
  }

  if (action === "paste" && menu.zone === "input" && pasteViaShellClipboard(menu.zone)) {
    return {
      route: "iframe-desktop",
      action: "paste",
      readClipboard: true,
    };
  }

  if (isTextEditAction(action) && menu.zone === "input") {
    return { route: "iframe-desktop", action, readClipboard: false };
  }

  if (isSidebarAction(action)) {
    return { route: "iframe-legacy", action };
  }

  return { route: "iframe-legacy", action };
}
