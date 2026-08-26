import {
  shouldClearSelectionAfterCopy,
  shouldShowCopyToast,
} from "./policies";
import { planDesktopDispatch } from "./routing";
import type { MenuOpenContext } from "./types";
import { postHarnessFrame } from "../harnessFramePost";
import { insertTextAtField, runTextEditAction } from "../textEditActions";

export type DispatchOpts = {
  frame: HTMLIFrameElement | null;
  menu: MenuOpenContext | null;
  onCopied?: () => void;
};

async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

async function writeClipboardText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * 统一桌面操作入口：菜单 / 未来顶栏按钮 / 快捷键代理均走此函数。
 */
export async function dispatchDesktopAction(
  action: string,
  opts: DispatchOpts,
): Promise<void> {
  const { frame, menu, onCopied } = opts;
  const plan = planDesktopDispatch(action, menu);
  if (plan.route === "noop" || !menu) return;

  if (plan.route === "shell-input") {
    if (plan.readClipboard) {
      const text = await readClipboardText().catch(() => "");
      if (!text) return;
      insertTextAtField(menu.shellTarget!, text);
      return;
    }
    if (plan.action === "copy") {
      runTextEditAction(menu.shellTarget!, "copy");
      return;
    }
    runTextEditAction(menu.shellTarget!, plan.action);
    return;
  }

  if (plan.route === "shell-copy") {
    try {
      await writeClipboardText(plan.text);
      if (shouldClearSelectionAfterCopy(plan.zone)) {
        postHarnessFrame(frame, { type: "clear-selection" });
      }
      if (shouldShowCopyToast(plan.zone) && onCopied) onCopied();
    } catch {
      postHarnessFrame(frame, {
        type: "context-menu-action",
        action: "copy",
      });
    }
    return;
  }

  if (plan.route === "iframe-desktop") {
    const text = plan.readClipboard
      ? await readClipboardText().catch(() => "")
      : undefined;
    if (plan.readClipboard && !text) return;
    postHarnessFrame(frame, {
      type: "desktop-action",
      kind: "textEdit",
      action: plan.action,
      ...(text ? { text } : {}),
    });
    return;
  }

  if (plan.route === "iframe-legacy") {
    postHarnessFrame(frame, {
      type: "context-menu-action",
      action: plan.action,
    });
    return;
  }
}
