/** 顶中短提示（复制成功等）：挂载 / 自动淡出 */

import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_VISIBLE_MS = 1800;
const TOAST_WITH_ACTION_MS = 8000;
const TOAST_LEAVE_MS = 300;

export type ShellToastAction = {
  label: string;
  onClick: () => void;
};

export type ShowToastOptions = {
  action?: ShellToastAction;
  /** 默认无 action 为 1800ms；带 action 为 8000ms */
  durationMs?: number;
};

export function useShellToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ShellToastAction | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const messageRef = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    hideTimer.current = null;
    leaveTimer.current = null;
  }, []);

  const dismissToast = useCallback(() => {
    clearTimers();
    if (messageRef.current == null) return;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      messageRef.current = null;
      setMessage(null);
      setAction(null);
      setLeaving(false);
      leaveTimer.current = null;
    }, TOAST_LEAVE_MS);
  }, [clearTimers]);

  const showToast = useCallback((text: string, options?: ShowToastOptions) => {
    clearTimers();
    messageRef.current = text;
    setMessage(text);
    setAction(options?.action ?? null);
    setLeaving(false);
    const visibleMs =
      options?.durationMs ??
      (options?.action ? TOAST_WITH_ACTION_MS : TOAST_VISIBLE_MS);
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null;
      dismissToast();
    }, visibleMs);
  }, [clearTimers, dismissToast]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers],
  );

  return {
    showToast,
    dismissToast,
    toastMessage: message,
    toastAction: action,
    toastLeaving: leaving,
    toastVisible: message != null,
  };
}
