/** 首跑等引导阶段：仅产品名 + 窗控，避免菜单/设置等提前操作。 */

import { useLocale } from "../../shell/locale";
import { WindowControls } from "./WindowControls";
import type { WinAction } from "./titlebarTypes";

type Props = {
  maximized: boolean;
  onWin: (action: WinAction) => void;
};

export function MinimalTitleBar({ maximized, onWin }: Props) {
  const { t } = useLocale();

  return (
    <header className="titlebar titlebar-minimal">
      <div
        className="titlebar-minimal-drag"
        data-tauri-drag-region
        onDoubleClick={() => void onWin("maximize")}
      >
        <span className="titlebar-product" data-tauri-drag-region>
          {t("chrome.productName")}
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
