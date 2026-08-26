/** ShellDialogFrame 焦点陷阱纯逻辑（可单测） */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function resolveFocusTrapTab(
  shiftKey: boolean,
  activeIndex: number,
  count: number,
): "first" | "last" | null {
  if (count <= 0) return null;
  if (activeIndex < 0) {
    return shiftKey ? "last" : "first";
  }
  if (shiftKey && activeIndex === 0) return "last";
  if (!shiftKey && activeIndex === count - 1) return "first";
  return null;
}

export function getFocusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}
