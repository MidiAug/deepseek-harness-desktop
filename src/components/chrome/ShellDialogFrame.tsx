import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onDismiss();
    }
    document.addEventListener("keydown", onKey, true);
    window.getSelection()?.removeAllRanges();
    panelRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onDismiss]);

  if (!open) return null;

  const backdropCls = ["modal-backdrop", backdropClassName]
    .filter(Boolean)
    .join(" ");
  const panelCls = ["modal", className].filter(Boolean).join(" ");

  return (
    <div
      className={backdropCls}
      role="presentation"
      onClick={() => {
        if (!busy) onDismiss();
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
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
