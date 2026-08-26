import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getFocusableElements,
  resolveFocusTrapTab,
} from "./shellDialogFocus";

type Props = {
  open: boolean;
  onDismiss: () => void;
  /** true 时禁止 ESC / 点遮罩关闭 */
  busy?: boolean;
  className?: string;
  backdropClassName?: string;
  role?: "dialog" | "alertdialog";
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  children: ReactNode;
};

/**
 * 壳对话框行为壳：遮罩、ESC、点遮罩关闭、聚焦、清选区。
 * 不含 Ctrl+A（嵌入 DSH 仍走 App.tsx / harnessFramePost）。
 *
 * 遮罩关闭须「武装」后再响应：打开设置的同一次 click 若落到刚挂载的
 * backdrop，会立刻 onDismiss → 设置闪关，简洁顶栏又因失悬停/suppress-hover 消失。
 */
export function ShellDialogFrame({
  open,
  onDismiss,
  busy = false,
  className,
  backdropClassName,
  role = "dialog",
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [dismissArmed, setDismissArmed] = useState(false);

  useEffect(() => {
    if (!open) {
      setDismissArmed(false);
      return;
    }
    setDismissArmed(false);
    // 等开启该次指针事件结束后再允许点遮罩关闭
    const id = window.setTimeout(() => setDismissArmed(true), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && dismissArmed) {
        onDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusableElements(panel);
      const active = document.activeElement;
      const activeIndex =
        active instanceof HTMLElement ? focusable.indexOf(active) : -1;
      const wrap = resolveFocusTrapTab(e.shiftKey, activeIndex, focusable.length);
      if (wrap === "first") {
        e.preventDefault();
        focusable[0]?.focus({ preventScroll: true });
      } else if (wrap === "last") {
        e.preventDefault();
        focusable[focusable.length - 1]?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", onKey, true);
    window.getSelection()?.removeAllRanges();
    panelRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, dismissArmed, onDismiss]);

  if (!open) return null;

  const backdropCls = ["modal-backdrop", backdropClassName]
    .filter(Boolean)
    .join(" ");
  const panelCls = ["modal", className].filter(Boolean).join(" ");

  return (
    <div
      className={backdropCls}
      role="presentation"
      onPointerDown={(e) => {
        // 只认直接点在遮罩上（不认从触发钮冒泡/穿透的残余）
        if (e.target !== e.currentTarget) return;
        if (!busy && dismissArmed) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={panelCls}
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
