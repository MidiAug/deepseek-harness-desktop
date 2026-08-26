/** Harness iframe 右键 + 壳层：B49 桌面语义桥 */

import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";
import { useLocale } from "../locale";
import { dispatchDesktopAction } from "../bridge/desktopBridge";
import type {
  HarnessContextMenuAction,
  HarnessContextMenuClose,
  HarnessContextMenuCopied,
  HarnessContextMenuOpen,
  HarnessInjectDiag,
  HarnessInjectError,
  ShellContextMenuState,
} from "../types/context-menu";
import { useAppToast } from "../contexts/ShellToastProvider";
import { shellLog } from "../logger";
import { recordInjectError } from "../diagnosticsContext";

const MSG_SOURCE = "dsh-shell-context-menu";
const INJECT_DIAG_SOURCE = "dsh-shell-inject";

const SETTINGS_INPUT_SELECTOR =
  ".settings-control input, .settings-control textarea, .settings-control [contenteditable='true']";

function formatInjectDiag(
  data: HarnessInjectDiag | HarnessInjectError,
): string {
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
        | HarnessInjectError
        | null;
      if (!data) return;

      const frame = iframeRef.current;
      if (!frame || ev.source !== frame.contentWindow) return;

      if (
        data.type === "diag" &&
        (data.source === MSG_SOURCE || data.source === INJECT_DIAG_SOURCE)
      ) {
        const ev = String(data.event ?? "");
        if (ev.startsWith("sel-")) {
          // inject 仅在全选失败时上报 sel-*
          shellLog.info("sel", formatInjectDiag(data));
        } else {
          shellLog.info("inject", formatInjectDiag(data));
        }
        return;
      }

      if (
        data.type === "inject-error" &&
        data.source === MSG_SOURCE
      ) {
        const line = formatInjectDiag(data);
        recordInjectError(line);
        shellLog.warn("inject", line);
        shellLog.op(
          "inject.error",
          { event: String(data.event ?? "unknown") },
          "err",
        );
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
      const selectedText =
        typeof data.selectedText === "string" && data.selectedText.trim()
          ? data.selectedText.trim()
          : undefined;
      setMenu({
        zone,
        x: rect.left + data.x,
        y: rect.top + data.y,
        selectedText,
      });
      shellLog.op("contextMenu.open", { zone });
    }

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [harnessEnabled, iframeRef, notifyCopied]);

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
      const frame = iframeRef.current;
      const ctx = menu
        ? {
            zone: menu.zone,
            selectedText: menu.selectedText,
            shellTarget: menu.shellTarget,
          }
        : null;

      if (action === "selectAll" && !menu?.shellTarget) {
        try {
          frame?.focus();
          frame?.contentWindow?.focus();
        } catch {
          /* ignore */
        }
      }

      void dispatchDesktopAction(action, {
        frame,
        menu: ctx,
        onCopied: notifyCopied,
      });
      shellLog.op("contextMenu.action", { zone: menu?.zone ?? "unknown", action });
      setMenu(null);
    },
    [iframeRef, menu, notifyCopied],
  );

  return {
    menu,
    close,
    selectAction,
  };
}
