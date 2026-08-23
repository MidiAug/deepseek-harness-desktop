/** 壳弹窗 Ctrl+A：与 iframe 内 DSH 弹窗同一策略（单 range、只选说明性叶子） */

export function clearParentSelection() {
  window.getSelection()?.removeAllRanges();
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      "textarea, input, [contenteditable='true'], [contenteditable='']",
    ) != null
  );
}

const SHELL_DIALOG_LEAF =
  ".settings-cell-desc, .lead, .field span, p, h2, h3, li, label";

function selectAllWithinRoot(root: Element, leafSelector: string): boolean {
  const leaves = [...root.querySelectorAll(leafSelector)].filter(
    (el) => (el.textContent?.replace(/\s+/g, "") ?? "").length > 0,
  );
  if (leaves.length === 0) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStartBefore(leaves[0]);
  range.setEndAfter(leaves[leaves.length - 1]);
  sel.addRange(range);
  return true;
}

function selectAllInShellDialog(): boolean {
  const modal =
    document.querySelector(".settings-modal") ??
    document.querySelector(".modal.close-ask") ??
    document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!modal) return false;
  return selectAllWithinRoot(modal, SHELL_DIALOG_LEAF);
}

/** 在弹窗 keydown 里调用；输入框内仍保留原生全选 */
export function blockModalSelectAll(e: KeyboardEvent) {
  if ((e.key !== "a" && e.key !== "A") || !(e.ctrlKey || e.metaKey)) return;
  if (isEditableTarget(e.target)) return;
  e.preventDefault();
  if (!selectAllInShellDialog()) {
    clearParentSelection();
  }
}
