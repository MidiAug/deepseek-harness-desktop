/** 壳 ↔ harness iframe postMessage 与 hover 残留处理 */

export function suppressHoverResidue() {
  document.body.classList.add("suppress-hover");
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    !(active instanceof HTMLIFrameElement)
  ) {
    active.blur();
  }
  window.setTimeout(() => {
    document.body.classList.remove("suppress-hover");
  }, 200);
}

export function postSelectionHygiene(
  frame: HTMLIFrameElement | null,
  enabled: boolean,
) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "dsh-shell", type: "selection-hygiene", enabled },
      "*",
    );
  } catch {
    /* cross-origin 或未就绪 */
  }
}

export function postSessionLogProxy(
  frame: HTMLIFrameElement | null,
  enabled: boolean,
) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "dsh-shell", type: "session-log-proxy", enabled },
      "*",
    );
  } catch {
    /* cross-origin 或未就绪 */
  }
}

export function postSessionLogClick(frame: HTMLIFrameElement | null) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "dsh-shell", type: "session-log-click" },
      "*",
    );
  } catch {
    /* cross-origin 或未就绪 */
  }
}
