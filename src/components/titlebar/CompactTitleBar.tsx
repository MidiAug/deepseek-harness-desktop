/**
 * 简洁叠层顶栏：按侧栏宽切 L 形；拖窗期间 pin 窗控显隐。
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { flushSync } from "react-dom";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { WindowControls } from "./WindowControls";
import type { WinAction } from "./titlebarTypes";

type Props = {
  sidebarWidthPx: number;
  maximized: boolean;
  /** 简洁 + 开关：在齿轮左侧放 Session log 代理按钮 */
  showSessionLog: boolean;
  onSessionLog: () => void;
  onOpenSettings: () => void;
  onWin: (action: WinAction) => void;
};

export function CompactTitleBar({
  sidebarWidthPx,
  maximized,
  showSessionLog,
  onSessionLog,
  onOpenSettings,
  onWin,
}: Props) {
  const [dragPin, setDragPin] = useState<"shown" | "hidden" | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const dragPinRef = useRef(dragPin);
  /** 右侧热区：用 enter/leave 记，避免 mousedown 时 :hover 已被拖窗清掉 */
  const rightHotRef = useRef(false);
  dragPinRef.current = dragPin;

  useEffect(() => {
    if (dragPin == null) return;
    function endDrag() {
      setDragPin(null);
      // 松手后若指针已不在热区，同步清掉；仍在则靠 :hover / 下次 leave
      const right = barRef.current?.querySelector(".titlebar-compact-right");
      if (
        !(right instanceof HTMLElement) ||
        !right.matches(":hover")
      ) {
        rightHotRef.current = false;
      }
    }
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, [dragPin]);

  function onCompactDragDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    const t = e.target as Element | null;
    if (t?.closest?.(".titlebar-right-reveal")) return;
    // 捕获阶段 + flushSync：赶在 WebView 清 :hover / 下一帧之前挂上 pin
    const right = barRef.current?.querySelector(".titlebar-compact-right");
    const wasShown = Boolean(
      rightHotRef.current ||
        (right instanceof HTMLElement &&
          (right.matches(":hover") || right.contains(document.activeElement))),
    );
    flushSync(() => {
      setDragPin(wasShown ? "shown" : "hidden");
    });
  }

  function onCompactRightEnter() {
    rightHotRef.current = true;
  }

  function onCompactRightLeave() {
    // 拖窗时常会合成 leave；冻结期间保留热区采样
    if (dragPinRef.current != null) return;
    rightHotRef.current = false;
  }

  const compactClass = [
    "titlebar",
    "titlebar-compact",
    dragPin === "shown"
      ? "is-drag-pin-shown"
      : dragPin === "hidden"
        ? "is-drag-pin-hidden"
        : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header
      className={compactClass}
      ref={barRef}
      style={
        {
          ["--sidebar-w" as string]: `${Math.max(36, Math.round(sidebarWidthPx))}px`,
        } as CSSProperties
      }
    >
      <div
        className="titlebar-compact-left"
        data-tauri-drag-region
        onMouseDownCapture={onCompactDragDown}
        onDoubleClick={() => void onWin("maximize")}
      />
      <div
        className="titlebar-compact-right"
        onMouseEnter={onCompactRightEnter}
        onMouseLeave={onCompactRightLeave}
      >
        <div
          className="titlebar-compact-right-drag"
          data-tauri-drag-region
          onMouseDownCapture={onCompactDragDown}
          onDoubleClick={() => void onWin("maximize")}
        />
        <div
          className="titlebar-right titlebar-right-reveal"
          role="toolbar"
          aria-label="窗口控制"
        >
          {showSessionLog && (
            <ShellTooltip label="下载 Session log">
              <button
                type="button"
                className="icon-btn"
                aria-label="下载 Session log"
                onClick={onSessionLog}
              >
                <DownloadIcon />
              </button>
            </ShellTooltip>
          )}
          <WindowControls
            maximized={maximized}
            onOpenSettings={onOpenSettings}
            onWin={onWin}
          />
        </div>
      </div>
    </header>
  );
}

function DownloadIcon() {
  // 对齐官方托盘下载：箭头入槽，线宽略粗
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v11"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M8 11l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 18h14"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
