/** 会话 phase 派生（可单测，避免 FSM 漂移） */

import type { SessionPhase } from "./types/ipc-types";

export function deriveShowIframe(
  phase: SessionPhase,
  serviceUrl: string | null,
): boolean {
  return (
    (phase === "embedding" || phase === "ready") && serviceUrl != null
  );
}

export function deriveShowBootPanel(phase: SessionPhase): boolean {
  return (
    phase === "idle" ||
    phase === "installing" ||
    phase === "spawning" ||
    phase === "embedding" ||
    phase === "failed" ||
    phase === "stopped"
  );
}
