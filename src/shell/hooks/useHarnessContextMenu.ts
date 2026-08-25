/** Harness iframe 右键 + 壳层：全局禁用原生菜单，仅白名单区域弹壳菜单。 */

import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";
import { useLocale } from "../locale";
import {
  clearFieldSelection,
  runTextEditAction,
  isTextEditAction,
} from "../textEditActions";
import type {
  HarnessContextMenuAction,
  HarnessContextMenuClose,
  HarnessContextMenuCopied,
  HarnessContextMenuOpen,
  HarnessInjectDiag,
  ShellContextMenuState,
} from "../types/context-menu";
import { useAppToast } from "../contexts/ShellToastProvider";
import { shellLog } from "../logger";

const MSG_SOURCE = "dsh-shell-context-menu";
const INJECT_DIAG_SOURCE = "dsh-shell-inject";

const SETTINGS_INPUT_SELECTOR =
  ".settings-control input, .settings-control textarea, .settings-control [contenteditable='true']";

function formatInjectDiag(data: HarnessInjectDiag): string {
  const { source: _s, type: _t, event, ...rest } = data;
  const parts: string[] = [event];
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    parts.push(`${k}=${String(v)}`);
  }
  return parts.join(" ");
}

export function useHarnessContextMenu(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  harnessEnabled: boolean,
  settingsInputEnabled = false,
) {
  const { t } = useLocale();
  const [menu, setMenu] = useState<ShellContextMenuState>(null);
  const { showToast } = useAppToast();

  const close = useCallback(() => setMenu(null), []);

  const notifyCopied = useCallback(() => {
    showToast(t("contextMenu.copied"));
  }, [showToast, t]);

  useEffect(() => {
    if (!harnessEnabled) {
      setMenu(null);
      return;
    }

    function onMsg(ev: MessageEvent) {
      const data = ev.data as
        | HarnessContextMenuOpen
        | HarnessContextMenuClose
        | HarnessContextMenuCopied
        | HarnessInjectDiag
        | null;
      if (!data) return;

      const frame = iframeRef.current;
      if (!frame || ev.source !== frame.contentWindow) return;

      if (
        data.type === "diag" &&
        (data.source === MSG_SOURCE || data.source === INJECT_DIAG_SOURCE)
      ) {
        shellLog.info("inject", formatInjectDiag(data));
        return;
      }

      if (data.source !== MSG_SOURCE) return;

      if (data.type === "close") {
        setMenu(null);
        return;
      }

      if (data.type === "copied") {
        notifyCopied();
        return;
      }

      if (data.type !== "open") return;

      const zone = data.zone;
      if (
        zone !== "workspace" &&
        zone !== "session" &&
        zone !== "input" &&
        zone !== "content"
      ) {
        return;
      }

      const rect = frame.getBoundingClientRect();
      setMenu({
        zone,
        x: rect.left + data.x,
        y: rect.top + data.y,
      });
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [harnessEnabled, iframeRef, notifyCopied]);

  // 壳 DOM：一律拦截原生菜单；设置输入框弹编辑菜单
  useEffect(() => {
    function onShellContextMenu(ev: MouseEvent) {
      ev.preventDefault();
      ev.stopPropagation();

      if (!settingsInputEnabled) return;

      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;

      const field = target.closest(SETTINGS_INPUT_SELECTOR);
      if (!field || !(field instanceof HTMLElement)) return;

      setMenu({
        zone: "input",
        x: ev.clientX,
        y: ev.clientY,
        shellTarget: field,
      });
    }

    document.addEventListener("contextmenu", onShellContextMenu, true);
    return () => document.removeEventListener("contextmenu", onShellContextMenu, true);
  }, [settingsInputEnabled]);

  useEffect(() => {
    if (!settingsInputEnabled) return;
    function onShellCopy(ev: ClipboardEvent) {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest(SETTINGS_INPUT_SELECTOR)) return;
      notifyCopied();
    }
    document.addEventListener("copy", onShellCopy);
    return () => document.removeEventListener("copy", onShellCopy);
  }, [settingsInputEnabled, notifyCopied]);

  useEffect(() => {
    if (!menu) return;
    function dismiss() {
      setMenu(null);
    }
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu]);

  const selectAction = useCallback(
    (action: HarnessContextMenuAction) => {
      const shellTarget = menu?.shellTarget;
      if (shellTarget) {
        if (isTextEditAction(action)) {
          runTextEditAction(shellTarget, action);
          if (action === "copy") {
            clearFieldSelection(shellTarget);
          }
        }
        setMenu(null);
        return;
      }

      const frame = iframeRef.current;
      if (action === "selectAll") {
        try {
          frame?.focus();
          frame?.contentWindow?.focus();
        } catch {
          /* 部分 WebView 可能拒绝跨窗 focus */
        }
      }
      try {
        frame?.contentWindow?.postMessage(
          { source: "dsh-shell", type: "context-menu-action", action },
          "*",
        );
      } catch {
        /* cross-origin 或未就绪 */
      }
      setMenu(null);
    },
    [iframeRef, menu?.shellTarget],
  );

  return {
    menu,
    close,
    selectAction,
  };
}
