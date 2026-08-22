/**
 * 经典占位顶栏：应用/帮助菜单 + 状态 + 窗控。
 */

import { useEffect, useRef, useState } from "react";
import { shellApi, type TitleConn } from "../../shell";
import { WindowControls } from "./WindowControls";
import type { WinAction } from "./titlebarTypes";

type MenuId = "app" | "help" | null;

type Props = {
  port: number | null;
  conn: TitleConn;
  maximized: boolean;
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

export function ClassicTitleBar({
  port,
  conn,
  maximized,
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
  const [menu, setMenu] = useState<MenuId>(null);
  const barRef = useRef<HTMLElement>(null);

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

  function toggle(id: Exclude<MenuId, null>) {
    setMenu((m) => (m === id ? null : id));
  }

  /** 已有菜单打开时，悬停其它项即切换（Windows 菜单栏行为） */
  function onMenuEnter(id: Exclude<MenuId, null>) {
    if (menu != null) setMenu(id);
  }

  const barClass = "titlebar";

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
                    onStop();
                  }}
                >
                  停止 harness
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
                    onOpenLogs();
                  }}
                >
                  打开日志目录
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onHideToTray();
                  }}
                >
                  隐藏到托盘
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
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onOpenPlatform();
                  }}
                >
                  DeepSeek API 平台
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onOpenLogs();
                  }}
                >
                  打开日志目录
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    onCopyVersion();
                  }}
                >
                  复制版本信息
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>

      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onDoubleClick={() => void onWin("maximize")}
      >
        <span className="titlebar-product" data-tauri-drag-region>
          DeepSeek Harness
        </span>
        <span className="titlebar-trail" data-tauri-drag-region>
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

      <div className="titlebar-right">
        <WindowControls
          maximized={maximized}
          onOpenSettings={onOpenSettings}
          onWin={onWin}
        />
      </div>
    </header>
  );
}
