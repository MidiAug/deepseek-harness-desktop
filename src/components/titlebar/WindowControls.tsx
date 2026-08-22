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
          <GearIcon />
        </button>
      </ShellTooltip>
      <ShellTooltip label="最小化">
        <button
          type="button"
          className="win-btn"
          aria-label="最小化"
          onClick={() => void onWin("minimize")}
        >
          <MinimizeIcon />
        </button>
      </ShellTooltip>
      <ShellTooltip label={maximized ? "还原" : "最大化"}>
        <button
          type="button"
          className="win-btn"
          aria-label={maximized ? "还原" : "最大化"}
          onClick={() => void onWin("maximize")}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
      </ShellTooltip>
      <ShellTooltip label="关闭">
        <button
          type="button"
          className="win-btn win-close"
          aria-label="关闭"
          onClick={() => void onWin("close")}
        >
          <CloseIcon />
        </button>
      </ShellTooltip>
    </>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.2.6.7 1 1.5 1.1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M2 6.5h8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect
        x="2.25"
        y="2.25"
        width="7.5"
        height="7.5"
        rx="0.6"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect
        x="1.75"
        y="3.5"
        width="6.5"
        height="6.5"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4 3.25V2.4c0-.5.4-.9.9-.9h4.7c.5 0 .9.4.9.9v4.7c0 .5-.4.9-.9.9H8.75"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
