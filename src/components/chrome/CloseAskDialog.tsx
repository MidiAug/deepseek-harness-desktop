import { useState, useEffect, useRef } from "react";
import {
  normalizeShellSettings,
  type ShellSettings,
} from "../../shell/settings";
import { shellApi, shellLog } from "../../shell";
import { useLocale } from "../../shell/locale";
import { blockModalSelectAll } from "../../shell/modalKeydown";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CloseAskDialog({ open, onClose }: Props) {
  const { t } = useLocale();
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      blockModalSelectAll(e);
    }
    document.addEventListener("keydown", onKey, true);
    window.getSelection()?.removeAllRanges();
    modalRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  async function apply(toTray: boolean) {
    setBusy(true);
    try {
      const cur = await shellApi.getShellSettings();
      const next: ShellSettings = {
        ...normalizeShellSettings(cur),
        closeToTray: toTray,
        closePrefSet: remember,
      };
      await shellApi.saveShellSettings(next);
      onClose();
      if (toTray) {
        await shellApi.hideToTray();
      } else {
        await shellApi.quitApp();
      }
    } catch (e) {
      shellLog.error("closeAsk", "apply close preference", e);
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop shell-confirm-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal shell-dialog close-ask"
        role="dialog"
        aria-labelledby="close-ask-title"
        aria-describedby="close-ask-body"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shell-dialog__head">
          <h2 id="close-ask-title" className="shell-dialog__title">
            {t("closeAsk.title")}
          </h2>
        </header>
        <p id="close-ask-body" className="shell-dialog__body">
          {t("closeAsk.lead")}
        </p>

        <footer className="shell-dialog__footer close-ask__footer">
          <label className="close-ask__remember">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(ev) => setRemember(ev.target.checked)}
            />
            <span>{t("closeAsk.remember")}</span>
          </label>
          <div className="close-ask__actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void apply(true)}
            >
              {t("closeAsk.toTray")}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void apply(false)}
            >
              {t("closeAsk.quit")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
