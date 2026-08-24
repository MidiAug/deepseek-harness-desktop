import { useLocale, type LocaleKey } from "../../shell/locale";
import { ShellDialogFrame } from "./ShellDialogFrame";

type Props = {
  open: boolean;
  titleKey: LocaleKey;
  bodyKey: LocaleKey;
  bodyParams?: Record<string, string>;
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
  bodyParams,
  confirmKey = "chrome.confirm.ok",
  cancelKey = "chrome.confirm.cancel",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useLocale();

  return (
    <ShellDialogFrame
      open={open}
      onDismiss={onCancel}
      busy={busy}
      className="shell-dialog shell-confirm"
      backdropClassName="shell-confirm-backdrop"
      role="alertdialog"
      aria-labelledby="shell-confirm-title"
      aria-describedby="shell-confirm-body"
    >
      <header className="shell-dialog__head">
        <h2 id="shell-confirm-title" className="shell-dialog__title">
          {t(titleKey)}
        </h2>
      </header>
      <p id="shell-confirm-body" className="shell-dialog__body">
        {t(bodyKey, bodyParams)}
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
    </ShellDialogFrame>
  );
}
