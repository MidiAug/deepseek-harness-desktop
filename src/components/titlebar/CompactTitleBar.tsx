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
import { IconDownloadOutline16 } from "../chrome/DshIcons";
import { useLocale } from "../../shell/locale";
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
  const { t } = useLocale();
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
      const right = barRef.current?.querySelector(".titlebar-compact-right");
      if (
        !(right instanceof HTMLElement) ||
        !right.matches(":hover")
      ) {
        rightHotRef.current = false;
      }
    }
    /** OS 拖窗常吞 mouseup；用 buttons===0 的 move 兜底 */
    function onMove(e: MouseEvent | PointerEvent) {
      if (e.buttons === 0) endDrag();
    }
    window.addEventListener("mouseup", endDrag, true);
    window.addEventListener("pointerup", endDrag, true);
    window.addEventListener("pointercancel", endDrag, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("blur", endDrag);
    return () => {
      window.removeEventListener("mouseup", endDrag, true);
      window.removeEventListener("pointerup", endDrag, true);
      window.removeEventListener("pointercancel", endDrag, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointermove", onMove);
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
          aria-label={t("chrome.windowControls.aria")}
        >
          {showSessionLog && (
            <ShellTooltip label={t("chrome.sessionLog")}>
              <button
                type="button"
                className="icon-btn"
                aria-label={t("chrome.sessionLog")}
                onClick={onSessionLog}
              >
                <IconDownloadOutline16 size={12} />
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
