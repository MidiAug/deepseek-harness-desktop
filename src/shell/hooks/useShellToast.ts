/** 顶中短提示（复制成功等）：挂载 / 自动淡出 */

import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_VISIBLE_MS = 1800;
const TOAST_LEAVE_MS = 300;

export function useShellToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const showToast = useCallback((text: string) => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    setMessage(text);
    setLeaving(false);
    hideTimer.current = window.setTimeout(() => {
      setLeaving(true);
      leaveTimer.current = window.setTimeout(() => {
        setMessage(null);
        setLeaving(false);
      }, TOAST_LEAVE_MS);
    }, TOAST_VISIBLE_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
    },
    [],
  );

  return {
    showToast,
    toastMessage: message,
    toastLeaving: leaving,
    toastVisible: message != null,
  };
}
