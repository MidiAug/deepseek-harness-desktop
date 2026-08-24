/**
 * 简洁叠层顶栏：按侧栏宽切 L 形；左右悬停显现；拖窗期间 pin 显隐。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { ShellTooltip } from "../chrome/ShellTooltip";
import { IconDownloadOutline16 } from "../chrome/DshIcons";
import { useLocale } from "../../shell/locale";
import { WindowControls } from "./WindowControls";
import { TitleBarHostMenus } from "./TitleBarHostMenus";
import type { WinAction } from "./titlebarTypes";

type Props = {
  sidebarWidthPx: number;
  maximized: boolean;
  titleActivity?: string | null;
  titleActivityTone?: "busy" | "error";
  showSessionLog: boolean;
  onSessionLog: () => void;
  onOpenSettings: () => void;
  onRestart: () => void;
  onStop: () => void;
  onOpenDshHome: () => void;
  onOpenLogs: () => void;
  onHideToTray: () => void;
  onAbout: () => void;
  onCopyVersion: () => void;
  onOpenPlatform: () => void;
  onWin: (action: WinAction) => void;
};

type DragPin = {
  left: "shown" | "hidden";
  right: "shown" | "hidden";
};

export function CompactTitleBar({
  sidebarWidthPx,
  maximized,
  titleActivity = null,
  titleActivityTone = "busy",
  showSessionLog,
  onSessionLog,
  onOpenSettings,
  onRestart,
  onStop,
  onOpenDshHome,
  onOpenLogs,
  onHideToTray,
  onAbout,
  onCopyVersion,
  onOpenPlatform,
  onWin,
}: Props) {
  const { t } = useLocale();
  const [dragPin, setDragPin] = useState<DragPin | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const dragPinRef = useRef(dragPin);
  const leftHotRef = useRef(false);
  const rightHotRef = useRef(false);
  dragPinRef.current = dragPin;

  useEffect(() => {
    if (dragPin == null) return;
    function endDrag() {
      setDragPin(null);
      const left = barRef.current?.querySelector(".titlebar-compact-left");
      const right = barRef.current?.querySelector(".titlebar-compact-right");
      if (
        !(left instanceof HTMLElement) ||
        !left.matches(":hover")
      ) {
        leftHotRef.current = false;
      }
      if (
        !(right instanceof HTMLElement) ||
        !right.matches(":hover")
      ) {
        rightHotRef.current = false;
      }
    }
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
    const el = e.target as Element | null;
    if (el?.closest?.(".titlebar-right-reveal, .titlebar-left-reveal, .menu-pop"))
      return;
    const left = barRef.current?.querySelector(".titlebar-compact-left");
    const right = barRef.current?.querySelector(".titlebar-compact-right");
    const leftShown = Boolean(
      menuOpen ||
        leftHotRef.current ||
        (left instanceof HTMLElement &&
          (left.matches(":hover") || left.contains(document.activeElement))),
    );
    const rightShown = Boolean(
      rightHotRef.current ||
        (right instanceof HTMLElement &&
          (right.matches(":hover") || right.contains(document.activeElement))),
    );
    flushSync(() => {
      setDragPin({
        left: leftShown ? "shown" : "hidden",
        right: rightShown ? "shown" : "hidden",
      });
    });
  }

  const onMenuOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
  }, []);

  const wrapMenus = useCallback((menus: ReactNode) => {
    return <div className="titlebar-left-reveal">{menus}</div>;
  }, []);

  const activity = titleActivity?.trim() || null;
  const isError = titleActivityTone === "error";

  const compactClass = [
    "titlebar",
    "titlebar-compact",
    dragPin?.left === "shown" ? "is-drag-pin-left-shown" : "",
    dragPin?.left === "hidden" ? "is-drag-pin-left-hidden" : "",
    dragPin?.right === "shown" ? "is-drag-pin-right-shown" : "",
    dragPin?.right === "hidden" ? "is-drag-pin-right-hidden" : "",
    menuOpen ? "is-menu-open" : "",
    activity ? "is-active" : "",
    isError ? "is-error" : "",
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
      <TitleBarHostMenus
        onRestart={onRestart}
        onStop={onStop}
        onOpenDshHome={onOpenDshHome}
        onOpenLogs={onOpenLogs}
        onHideToTray={onHideToTray}
        onAbout={onAbout}
        onCopyVersion={onCopyVersion}
        onOpenPlatform={onOpenPlatform}
        onMenuOpenChange={onMenuOpenChange}
        wrap={(menus) => (
          <div
            className="titlebar-compact-left"
            onMouseEnter={() => {
              leftHotRef.current = true;
            }}
            onMouseLeave={() => {
              if (dragPinRef.current != null || menuOpen) return;
              leftHotRef.current = false;
            }}
          >
            <div
              className="titlebar-compact-left-drag"
              data-tauri-drag-region
              onMouseDownCapture={onCompactDragDown}
              onDoubleClick={() => void onWin("maximize")}
            />
            {wrapMenus(menus)}
          </div>
        )}
      />
      <div
        className="titlebar-compact-right"
        onMouseEnter={() => {
          rightHotRef.current = true;
        }}
        onMouseLeave={() => {
          if (dragPinRef.current != null) return;
          rightHotRef.current = false;
        }}
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
      {activity && (
        <div
          className="titlebar-compact-activity"
          title={activity}
          aria-live="polite"
          aria-busy={!isError}
        >
          <span
            className={`titlebar-activity-text${isError ? " is-error" : ""}`}
          >
            {isError ? (
              <span className="titlebar-activity-mark" aria-hidden />
            ) : null}
            {activity}
          </span>
        </div>
      )}
    </header>
  );
}
