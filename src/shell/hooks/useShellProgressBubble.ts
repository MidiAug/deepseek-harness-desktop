/** 顶中进度气泡：挂载 / 淡出卸载（B7d）。 */

import { useEffect, useRef, useState } from "react";

const BUBBLE_LEAVE_MS = 300;

export function useShellProgressBubble(wantBubble: boolean) {
  const [bubbleLeaving, setBubbleLeaving] = useState(false);
  const bubbleWasShown = useRef(false);

  useEffect(() => {
    if (wantBubble) {
      bubbleWasShown.current = true;
      setBubbleLeaving(false);
      return;
    }
    if (!bubbleWasShown.current) return;
    setBubbleLeaving(true);
    const t = window.setTimeout(() => {
      setBubbleLeaving(false);
      bubbleWasShown.current = false;
    }, BUBBLE_LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [wantBubble]);

  return {
    bubbleVisible: wantBubble || bubbleLeaving,
    bubbleLeaving: !wantBubble && bubbleLeaving,
  };
}
