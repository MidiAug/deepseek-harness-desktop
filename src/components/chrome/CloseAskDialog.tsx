import { useState } from "react";
import {
  normalizeShellSettings,
  type ShellSettings,
} from "../../shell/settings";
import { shellApi, shellLog } from "../../shell";
import { useLocale } from "../../shell/locale";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CloseAskDialog({ open, onClose }: Props) {
  const { t } = useLocale();
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

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
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal close-ask"
        role="dialog"
        aria-labelledby="close-ask-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2 id="close-ask-title">{t("closeAsk.title")}</h2>
        </div>
        <p className="lead">{t("closeAsk.lead")}</p>

        <label className="field check">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={(ev) => setRemember(ev.target.checked)}
          />
          <span>
            {t("closeAsk.remember")}
            <small>{t("closeAsk.rememberHint")}</small>
          </span>
        </label>

        <div className="close-ask-actions">
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
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={onClose}
          >
            {t("closeAsk.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
