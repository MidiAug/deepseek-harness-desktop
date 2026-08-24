/** 首跑等引导阶段：仅标题 + 窗控，避免菜单/设置等提前操作。 */

import { useLocale } from "../../shell/locale";
import { WindowControls } from "./WindowControls";
import type { WinAction } from "./titlebarTypes";

type Props = {
  maximized: boolean;
  titleActivity?: string | null;
  titleActivityTone?: "busy" | "error";
  onWin: (action: WinAction) => void;
};

export function MinimalTitleBar({
  maximized,
  titleActivity = null,
  titleActivityTone = "busy",
  onWin,
}: Props) {
  const { t } = useLocale();
  const activity = titleActivity?.trim() || null;
  const showActivity = activity != null;
  const isError = titleActivityTone === "error";

  return (
    <header
      className={`titlebar titlebar-minimal${showActivity ? " is-active" : ""}${isError ? " is-error" : ""}`}
    >
      <div
        className="titlebar-minimal-drag"
        data-tauri-drag-region
        onDoubleClick={() => void onWin("maximize")}
      >
        <span
          className={`titlebar-product${showActivity ? " is-activity" : ""}`}
          data-tauri-drag-region
          title={showActivity ? activity : undefined}
          aria-live={showActivity ? "polite" : undefined}
          aria-busy={showActivity && !isError ? true : undefined}
        >
          {showActivity ? (
            <span
              className={`titlebar-activity-text${isError ? " is-error" : ""}`}
              data-tauri-drag-region
            >
              {isError ? (
                <span className="titlebar-activity-mark" aria-hidden />
              ) : null}
              {activity}
            </span>
          ) : (
            t("chrome.productName")
          )}
        </span>
      </div>
      <div className="titlebar-right">
        <WindowControls
          maximized={maximized}
          hideSettings
          onOpenSettings={() => undefined}
          onWin={onWin}
        />
      </div>
    </header>
  );
}
