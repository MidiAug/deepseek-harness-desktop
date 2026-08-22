/** 输入框右键：撤销/复制等（壳与 iframe 共用 execCommand） */

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

export function runTextEditAction(el: HTMLElement, action: TextEditAction) {
  el.focus();
  document.execCommand(action);
}

/** 复制后收起输入框选区，避免灰色残留 */
export function clearFieldSelection(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0;
    el.setSelectionRange(pos, pos);
    return;
  }
  window.getSelection()?.removeAllRanges();
}
