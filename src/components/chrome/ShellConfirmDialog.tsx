import { useEffect, useRef } from "react";
import { useLocale, type LocaleKey } from "../../shell/locale";
import { blockModalSelectAll } from "../../shell/modalKeydown";

type Props = {
  open: boolean;
  titleKey: LocaleKey;
  bodyKey: LocaleKey;
  confirmKey?: LocaleKey;
  cancelKey?: LocaleKey;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** 壳内通用确认弹窗（替代 window.confirm）。 */
export function ShellConfirmDialog({
  open,
  titleKey,
  bodyKey,
  confirmKey = "chrome.confirm.ok",
  cancelKey = "chrome.confirm.cancel",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useLocale();
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
      blockModalSelectAll(e);
    }
    document.addEventListener("keydown", onKey, true);
    window.getSelection()?.removeAllRanges();
    modalRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop shell-confirm-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal shell-dialog shell-confirm"
        role="alertdialog"
        aria-labelledby="shell-confirm-title"
        aria-describedby="shell-confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shell-dialog__head">
          <h2 id="shell-confirm-title" className="shell-dialog__title">
            {t(titleKey)}
          </h2>
        </header>
        <p id="shell-confirm-body" className="shell-dialog__body">
          {t(bodyKey)}
        </p>
        <footer className="shell-dialog__footer">
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={onCancel}
          >
            {t(cancelKey)}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onConfirm}
          >
            {t(confirmKey)}
          </button>
        </footer>
      </div>
    </div>
  );
}
