/** 壳 → harness iframe postMessage（选区 / 洁净 / 弹窗态） */

export function postHarnessFrame(
  frame: HTMLIFrameElement | null,
  payload: Record<string, unknown>,
) {
  try {
    frame?.contentWindow?.postMessage({ source: "dsh-shell", ...payload }, "*");
  } catch {
    /* 未就绪 */
  }
}

export function clearShellSelections(frame: HTMLIFrameElement | null) {
  postHarnessFrame(frame, { type: "clear-selection" });
  window.getSelection()?.removeAllRanges();
}

export function setHarnessShellModalOpen(
  frame: HTMLIFrameElement | null,
  open: boolean,
) {
  postHarnessFrame(frame, { type: "shell-modal-open", open });
}

/** 弹窗关闭后把键盘焦点还给 harness（避免 Ctrl+A 落在壳 DOM） */
export function focusHarnessFrame(frame: HTMLIFrameElement | null) {
  if (!frame) return;
  try {
    frame.focus();
    frame.contentWindow?.focus();
  } catch {
    /* WebView 可能拒绝跨窗 focus */
  }
}

/** 壳层拦截到 Ctrl+A 时，委托 iframe 执行全选 */
export function requestHarnessSelectAll(frame: HTMLIFrameElement | null) {
  postHarnessFrame(frame, { type: "shell-select-all" });
}

/** 关闭 Harness「Session 导出已开始下载」信息弹窗（best-effort）。 */
export function dismissSessionExportDialog(frame: HTMLIFrameElement | null) {
  postHarnessFrame(frame, { type: "session-log-dismiss-dialog" });
}
