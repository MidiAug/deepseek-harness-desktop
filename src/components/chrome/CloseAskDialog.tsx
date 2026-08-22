import { useState } from "react";
import {
  normalizeShellSettings,
  type ShellSettings,
} from "../../shell/settings";
import { shellApi } from "../../shell";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CloseAskDialog({ open, onClose }: Props) {
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
      console.error(e);
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
          <h2 id="close-ask-title">关闭窗口</h2>
        </div>
        <p className="lead">
          关闭时希望怎么做？官方 UI 服务可在托盘后台继续运行。
        </p>

        <label className="field check">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={(ev) => setRemember(ev.target.checked)}
          />
          <span>
            记住为我的默认选择
            <small>之后可在壳设置 → 窗口 中修改</small>
          </span>
        </label>

        <div className="close-ask-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void apply(true)}
          >
            最小化到托盘
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void apply(false)}
          >
            直接退出
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
