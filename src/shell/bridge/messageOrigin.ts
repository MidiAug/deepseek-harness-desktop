/** postMessage origin 白名单（loopback harness + 壳 dev/build） */

const LOOPBACK_ORIGIN =
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

const SHELL_ORIGIN =
  /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|tauri\.localhost|asset\.localhost)(:\d+)?$/i;

/** harness iframe（loopback 官方 UI） */
export function isTrustedHarnessOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;
  return LOOPBACK_ORIGIN.test(origin);
}

/** 壳 WebView（Vite dev / Tauri asset） */
export function isTrustedShellOrigin(origin: string): boolean {
  if (!origin || origin === "null") return false;
  if (SHELL_ORIGIN.test(origin)) return true;
  // Tauri 2 生产壳常见 origin
  if (/^https:\/\/tauri\.localhost/i.test(origin)) return true;
  if (/^http:\/\/tauri\.localhost/i.test(origin)) return true;
  return false;
}

/** 壳侧 listener：接受 harness loopback 或同源 */
export function isTrustedInboundMessageOrigin(origin: string): boolean {
  if (typeof window !== "undefined" && origin === window.location.origin) {
    return true;
  }
  return isTrustedHarnessOrigin(origin);
}

/** inject 侧：只接受父窗（壳）postMessage */
export function isTrustedParentShellOrigin(origin: string): boolean {
  return isTrustedShellOrigin(origin);
}
