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
import type { WinAction } from "./titlebarTypes";

type Props = {
  maximized: boolean;
  onOpenSettings: () => void;
  onWin: (action: WinAction) => void;
};

/** 设置齿轮 + 最小化 / 最大化·还原 / 关闭 */
export function WindowControls({
  maximized,
  onOpenSettings,
  onWin,
}: Props) {
  return (
    <>
      <ShellTooltip label="壳设置">
        <button
          type="button"
          className="icon-btn"
          aria-label="壳设置"
          onClick={onOpenSettings}
        >
          <IconSettingsOutline14 size={14} />
        </button>
      </ShellTooltip>
      <ShellTooltip label="最小化">
        <button
          type="button"
          className="win-btn"
          aria-label="最小化"
          onClick={() => void onWin("minimize")}
        >
          <IconWinMinimize16 size={12} />
        </button>
      </ShellTooltip>
      <ShellTooltip label={maximized ? "还原" : "最大化"}>
        <button
          type="button"
          className="win-btn"
          aria-label={maximized ? "还原" : "最大化"}
          onClick={() => void onWin("maximize")}
        >
          {maximized ? (
            <IconWinRestore16 size={12} />
          ) : (
            <IconWinMaximize16 size={12} />
          )}
        </button>
      </ShellTooltip>
      <ShellTooltip label="关闭">
        <button
          type="button"
          className="win-btn win-close"
          aria-label="关闭"
          onClick={() => void onWin("close")}
        >
          <IconCloseOutline16 size={12} />
        </button>
      </ShellTooltip>
    </>
  );
}
