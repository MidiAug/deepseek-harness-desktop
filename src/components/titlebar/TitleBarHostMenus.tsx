/**
 * 顶栏「应用 / 帮助」菜单（经典占位与简洁悬停共用）。
 */

import { useEffect, useState, type ReactNode } from "react";
import { shellApi } from "../../shell";
import { useLocale } from "../../shell/locale";

type MenuId = "app" | "help" | null;

export type TitleBarHostMenusProps = {
  onRestart: () => void;
  onStop: () => void;
  onOpenDshHome: () => void;
  onOpenLogs: () => void;
  onHideToTray: () => void;
  onAbout: () => void;
  onCopyVersion: () => void;
  onOpenPlatform: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  /** 外层包裹（简洁模式把菜单放进 left-reveal） */
  wrap?: (menus: ReactNode) => ReactNode;
};

export function TitleBarHostMenus({
  onRestart,
  onStop,
  onOpenDshHome,
  onOpenLogs,
  onHideToTray,
  onAbout,
  onCopyVersion,
  onOpenPlatform,
  onMenuOpenChange,
  wrap,
}: TitleBarHostMenusProps) {
  const { t } = useLocale();
  const [menu, setMenu] = useState<MenuId>(null);

  useEffect(() => {
    onMenuOpenChange?.(menu != null);
  }, [menu, onMenuOpenChange]);

  useEffect(() => {
    if (!menu) return;
    function onDocPointerDown(e: Event) {
      const el = e.target as Element | null;
      if (!el) {
        setMenu(null);
        return;
      }
      // 菜单触发器 / 下拉内：不关（可切换另一项）
      if (el.closest?.(".menu-wrap")) return;
      setMenu(null);
    }
    // 捕获：先于按钮 click；iframe 外点靠 menu-dismiss
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [menu]);

  function toggle(id: Exclude<MenuId, null>) {
    setMenu((m) => (m === id ? null : id));
  }

  function onMenuEnter(id: Exclude<MenuId, null>) {
    if (menu != null) setMenu(id);
  }

  const menus = (
    <div className="titlebar-left">
      <div className="menu-wrap">
        <button
          type="button"
          className={`menu-trigger${menu === "app" ? " open" : ""}`}
          onClick={() => toggle("app")}
          onMouseEnter={() => onMenuEnter("app")}
        >
          {t("chrome.menu.app")}
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
                {t("chrome.menu.restartUi")}
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
                {t("settings.port.stop")}
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
                {t("chrome.menu.openDshHome")}
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
                {t("chrome.menu.openLogs")}
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
                {t("chrome.menu.hideTray")}
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
                {t("chrome.menu.quit")}
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
          {t("chrome.menu.help")}
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
                {t("chrome.menu.about")}
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
                {t("chrome.menu.platformApi")}
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
                {t("chrome.menu.openLogs")}
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
                {t("chrome.menu.copyVersion")}
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      {menu != null && (
        <button
          type="button"
          className="menu-dismiss"
          aria-label={t("chrome.menu.closeAria")}
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        />
      )}
      {wrap ? wrap(menus) : menus}
    </>
  );
}
