import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ChromePrefs } from "../shellSettings";
import { shellApi, type TitleConn } from "../shell";
import { ShellTooltip } from "./ShellTooltip";

type Props = {
  port: number | null;
  conn: TitleConn;
  chrome: ChromePrefs;
  /** 简洁叠层：官方 UI 侧栏宽（px），由 WebView 注入上报 */
  sidebarWidthPx: number;
  onOpenSettings: () => void;
  onRestart: () => void;
  onOpenDshHome: () => void;
  onAbout: () => void;
};

type MenuId = "app" | "view" | "help" | null;

export function ShellTitleBar({
  port,
  conn,
  chrome,
  sidebarWidthPx,
  onOpenSettings,
  onRestart,
  onOpenDshHome,
  onAbout,
}: Props) {
  const [menu, setMenu] = useState<MenuId>(null);
  const [maximized, setMaximized] = useState(false);
  /** 拖窗期间冻结窗控显隐，不依赖会被系统清掉的 :hover */
  const [dragPin, setDragPin] = useState<"shown" | "hidden" | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const dragPinRef = useRef(dragPin);
  /** 右侧热区：用 enter/leave 记，避免 mousedown 时 :hover 已被拖窗清掉 */
  const rightHotRef = useRef(false);
  const compact = chrome.titlebarCompact;
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

  // 点顶栏空白 / 非当前菜单区时关闭；iframe 点不到 document，靠 .menu-dismiss 层
  useEffect(() => {
    if (!menu) return;
    function onDocClick(e: Event) {
      const el = e.target as Element | null;
      if (!el) {
        setMenu(null);
        return;
      }
      const wrap = el.closest?.(".menu-wrap");
      if (wrap && barRef.current?.contains(wrap)) return;
      setMenu(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menu]);

  useEffect(() => {
    if (compact) setMenu(null);
  }, [compact]);

  useEffect(() => {
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    async function syncMaximized() {
      try {
        const next = await w.isMaximized();
        if (!cancelled) setMaximized(next);
      } catch {
        /* 开发态偶发 IPC 未就绪，忽略 */
      }
    }

    void syncMaximized();
    void w.onResized(() => {
      void syncMaximized();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const statusLabel =
    conn === "connected" && port != null
      ? `:${port}`
      : conn === "error"
        ? "启动失败"
        : "准备中";

  const statusClass =
    conn === "connected"
      ? "is-ok"
      : conn === "error"
        ? "is-err"
        : "is-busy";

  async function win(action: "minimize" | "maximize" | "close") {
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "maximize") {
      await w.toggleMaximize();
      setMaximized(await w.isMaximized());
    } else await w.close();
  }

  function toggle(id: Exclude<MenuId, null>) {
    setMenu((m) => (m === id ? null : id));
  }

  /** 已有菜单打开时，悬停其它项即切换（Windows 菜单栏行为） */
  function onMenuEnter(id: Exclude<MenuId, null>) {
    if (menu != null) setMenu(id);
  }

  const controls = (
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
          onClick={() => void win("minimize")}
        >
          <MinimizeIcon />
        </button>
      </ShellTooltip>
      <ShellTooltip label={maximized ? "还原" : "最大化"}>
        <button
          type="button"
          className="win-btn"
          aria-label={maximized ? "还原" : "最大化"}
          onClick={() => void win("maximize")}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
      </ShellTooltip>
      <ShellTooltip label="关闭">
        <button
          type="button"
          className="win-btn win-close"
          aria-label="关闭"
          onClick={() => void win("close")}
        >
          <CloseIcon />
        </button>
      </ShellTooltip>
    </>
  );

  // 简洁：按侧栏宽切 L 形白块（左 25 / 右 35）；窗控悬停显；未盖住区域 pointer-events 穿透
  if (compact) {
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
          onDoubleClick={() => void win("maximize")}
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
            onDoubleClick={() => void win("maximize")}
          />
          <div
            className="titlebar-right titlebar-right-reveal"
            role="toolbar"
            aria-label="窗口控制"
          >
            {controls}
          </div>
        </div>
      </header>
    );
  }

  const barClass = [
    "titlebar",
    `titlebar-style-${chrome.titlebarStyle}`,
  ].join(" ");

  return (
    <header className={barClass} ref={barRef}>
      {menu != null && (
        <button
          type="button"
          className="menu-dismiss"
          aria-label="关闭菜单"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
      )}
      <div className="titlebar-left">
        <div className="menu-wrap">
          <button
            type="button"
            className={`menu-trigger${menu === "app" ? " open" : ""}`}
            onClick={() => toggle("app")}
            onMouseEnter={() => onMenuEnter("app")}
          >
            应用
          </button>
          {menu === "app" && (
            <ul className="menu-pop" role="menu">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onRestart();
                  }}
                >
                  重启官方 UI
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onOpenDshHome();
                  }}
                >
                  打开 DSH_HOME
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    void shellApi.quitApp();
                  }}
                >
                  退出
                </button>
              </li>
            </ul>
          )}
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className={`menu-trigger${menu === "view" ? " open" : ""}`}
            onClick={() => toggle("view")}
            onMouseEnter={() => onMenuEnter("view")}
          >
            视图
          </button>
          {menu === "view" && (
            <ul className="menu-pop" role="menu">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onOpenSettings();
                  }}
                >
                  壳设置
                </button>
              </li>
            </ul>
          )}
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className={`menu-trigger${menu === "help" ? " open" : ""}`}
            onClick={() => toggle("help")}
            onMouseEnter={() => onMenuEnter("help")}
          >
            帮助
          </button>
          {menu === "help" && (
            <ul className="menu-pop" role="menu">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onAbout();
                  }}
                >
                  关于
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>

      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={() => void win("maximize")}
      >
        <span className="titlebar-status" data-tauri-drag-region>
          <span className="titlebar-product" data-tauri-drag-region>
            DeepSeek Harness
          </span>
          <span className="titlebar-dot" aria-hidden data-tauri-drag-region>
            ·
          </span>
          <span
            className={`titlebar-conn ${statusClass}`}
            data-tauri-drag-region
          >
            <span className="titlebar-conn-mark" aria-hidden />
            {statusLabel}
          </span>
        </span>
      </div>

      <div className="titlebar-right">{controls}</div>
    </header>
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
      <path d="M2 6.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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
