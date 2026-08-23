/** 壳 chrome 统一日志：经 tauri-plugin-log 落盘；dev 下 attachConsole 可见。 */

import { debug, info, warn, error } from "@tauri-apps/plugin-log";

const lastAt = new Map<string, number>();

function allowKey(key: string, intervalMs: number): boolean {
  const now = Date.now();
  const prev = lastAt.get(key) ?? 0;
  if (now - prev < intervalMs) return false;
  lastAt.set(key, now);
  return true;
}

function fmt(scope: string, msg: string) {
  return `[ui::${scope}] ${msg}`;
}

export const shellLog = {
  debug: (scope: string, msg: string) => debug(fmt(scope, msg)),
  info: (scope: string, msg: string) => info(fmt(scope, msg)),
  /** 同 scope+msg 默认 2s 内只记一次（Resize 等高频路径用）。 */
  infoThrottled: (scope: string, msg: string, intervalMs = 2000) => {
    const key = `i:${scope}:${msg}`;
    if (allowKey(key, intervalMs)) info(fmt(scope, msg));
  },
  warn: (scope: string, msg: string) => warn(fmt(scope, msg)),
  error: (scope: string, msg: string, err?: unknown) =>
    error(
      `${fmt(scope, msg)}${err != null ? `: ${String(err)}` : ""}`,
    ),
};
