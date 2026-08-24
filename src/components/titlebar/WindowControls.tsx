import {
  IconCloseOutline16,
  IconSettingsOutline14,
} from "../chrome/DshIcons";
import {
  IconWinMaximize16,
  IconWinMinimize16,
  IconWinRestore16,
} from "../chrome/ShellWindowIcons";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { useLocale } from "../../shell/locale";
import type { WinAction } from "./titlebarTypes";

type Props = {
  maximized: boolean;
  hideSettings?: boolean;
  onOpenSettings: () => void;
  onWin: (action: WinAction) => void;
};

/** 设置齿轮 + 最小化 / 最大化·还原 / 关闭 */
export function WindowControls({
  maximized,
  hideSettings = false,
  onOpenSettings,
  onWin,
}: Props) {
  const { t } = useLocale();

  return (
    <>
      {!hideSettings && (
        <ShellTooltip label={t("settings.title")}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("settings.title")}
            onClick={onOpenSettings}
          >
            <IconSettingsOutline14 size={14} />
          </button>
        </ShellTooltip>
      )}
      <ShellTooltip label={t("chrome.minimize")}>
        <button
          type="button"
          className="win-btn"
          aria-label={t("chrome.minimize")}
          onClick={() => void onWin("minimize")}
        >
          <IconWinMinimize16 size={12} />
        </button>
      </ShellTooltip>
      <ShellTooltip label={maximized ? t("chrome.restore") : t("chrome.maximize")}>
        <button
          type="button"
          className="win-btn"
          aria-label={maximized ? t("chrome.restore") : t("chrome.maximize")}
          onClick={() => void onWin("maximize")}
        >
          {maximized ? (
            <IconWinRestore16 size={12} />
          ) : (
            <IconWinMaximize16 size={12} />
          )}
        </button>
      </ShellTooltip>
      <ShellTooltip label={t("chrome.close")}>
        <button
          type="button"
          className="win-btn win-close"
          aria-label={t("chrome.close")}
          onClick={() => void onWin("close")}
        >
          <IconCloseOutline16 size={12} />
        </button>
      </ShellTooltip>
    </>
  );
}
