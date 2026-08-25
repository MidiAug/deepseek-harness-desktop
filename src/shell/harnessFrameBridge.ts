/** 壳 ↔ harness iframe postMessage 与 hover 残留处理 */

/** 设置/关窗等壳弹层打开时：禁止 suppress-hover 藏简洁顶栏、禁止 blur 弹层焦点 */
export function isShellModalOpen(): boolean {
  return (
    document.body.classList.contains("shell-modal-open") ||
    document.querySelector(".modal-backdrop") != null
  );
}

export function suppressHoverResidue() {
  if (isShellModalOpen()) return;
  // 简洁顶栏：从 iframe 点齿轮会触发 window focus → 若此时清悬停，
  // CSS 会把 reveal 设为 pointer-events:none 并 blur 按钮，吃掉 click。
  if (
    document.querySelector(
      ".titlebar:hover, .titlebar-compact-left:hover, .titlebar-compact-right:hover",
    ) ||
    (document.activeElement instanceof HTMLElement &&
      document.activeElement.closest(".titlebar") != null)
  ) {
    return;
  }
  if (document.body.classList.contains("suppress-hover")) return;
  document.body.classList.add("suppress-hover");
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    !(active instanceof HTMLIFrameElement) &&
    !active.closest(".modal, .modal-backdrop, .titlebar")
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
