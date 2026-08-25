import { useState, useEffect } from "react";
import {
  normalizeShellSettings,
  type ShellSettings,
} from "../../shell/settings";
import { shellApi, shellLog } from "../../shell";
import { useLocale } from "../../shell/locale";
import { ShellDialogFrame } from "./ShellDialogFrame";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CloseAskDialog({ open, onClose }: Props) {
  const { t } = useLocale();
  /** 仅全生命周期首次关窗默认勾选；已操作过关闭偏好则默认不勾 */
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    void shellApi
      .getShellSettings()
      .then((cur) => {
        if (cancelled) return;
        const s = normalizeShellSettings(cur);
        setRemember(!s.closePrefTouched);
      })
      .catch(() => {
        if (!cancelled) setRemember(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function apply(toTray: boolean) {
    setBusy(true);
    try {
      const cur = await shellApi.getShellSettings();
      const next: ShellSettings = {
        ...normalizeShellSettings(cur),
        closeToTray: toTray,
        closePrefSet: remember,
        closePrefTouched: true,
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
    <ShellDialogFrame
      open={open}
      onDismiss={onClose}
      busy={busy}
      className="shell-dialog close-ask"
      backdropClassName="shell-confirm-backdrop"
      aria-labelledby="close-ask-title"
      aria-describedby="close-ask-body"
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
    </ShellDialogFrame>
  );
}
