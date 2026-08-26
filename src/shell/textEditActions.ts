/** 输入框右键：撤销/复制等（壳与 iframe 共用） */

export const TEXT_EDIT_ACTIONS = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "selectAll",
] as const;

export type TextEditAction = (typeof TEXT_EDIT_ACTIONS)[number];

export type ContentCopyAction = "copy" | "selectAll";

export function isTextEditAction(action: string): action is TextEditAction {
  return (TEXT_EDIT_ACTIONS as readonly string[]).includes(action);
}

export function isContentCopyAction(
  action: string,
): action is ContentCopyAction {
  return action === "copy" || action === "selectAll";
}

export function insertTextAtField(el: HTMLElement, text: string): boolean {
  if (!text) return false;
  try {
    el.focus();
    if (el.isContentEditable) {
      return document.execCommand("insertText", false, text);
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? start;
      const val = el.value || "";
      el.value = val.slice(0, start) + text + val.slice(end);
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function runTextEditAction(el: HTMLElement, action: TextEditAction) {
  if (action === "copy") {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      document.execCommand("copy");
      return;
    }
  }
  if (action === "paste") {
    document.execCommand("paste");
    return;
  }
  el.focus();
  document.execCommand(action);
}

/** 仅 cut 等需要收起选区时调用；复制后勿用 */
export function clearFieldSelection(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0;
    el.setSelectionRange(pos, pos);
    return;
  }
  window.getSelection()?.removeAllRanges();
}
