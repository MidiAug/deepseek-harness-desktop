/** 壳 chrome 统一日志：经 tauri-plugin-log 落盘；dev 下 attachConsole 可见。 */

import { debug, info, warn, error } from "@tauri-apps/plugin-log";
import { getShellSessionId } from "./sessionId";

const lastAt = new Map<string, number>();

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function allowKey(key: string, intervalMs: number): boolean {
  const now = Date.now();
  const prev = lastAt.get(key) ?? 0;
  if (now - prev < intervalMs) return false;
  lastAt.set(key, now);
  return true;
}

function newOpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatFields(fields?: LogFields): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === "") continue;
    const s = String(v).replace(/\s+/g, " ").trim();
    parts.push(`${k}=${s}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function fmt(scope: string, msg: string, fields?: LogFields) {
  const sid = getShellSessionId();
  const base = `[ui::${scope}] session_id=${sid}${formatFields(fields)} ${msg}`.trim();
  return base;
}

export const shellLog = {
  debug: (scope: string, msg: string, fields?: LogFields) =>
    debug(fmt(scope, msg, fields)),
  info: (scope: string, msg: string, fields?: LogFields) =>
    info(fmt(scope, msg, fields)),
  /** 同 scope+msg 默认 2s 内只记一次（Resize 等高频路径用）。 */
  infoThrottled: (scope: string, msg: string, intervalMs = 2000, fields?: LogFields) => {
    const key = `i:${scope}:${msg}`;
    if (allowKey(key, intervalMs)) info(fmt(scope, msg, fields));
  },
  warn: (scope: string, msg: string, fields?: LogFields) =>
    warn(fmt(scope, msg, fields)),
  error: (scope: string, msg: string, err?: unknown, fields?: LogFields) => {
    const errPart = err != null ? `: ${String(err)}` : "";
    error(fmt(scope, `${msg}${errPart}`, fields));
  },
  /** 用户操作审计：自动带 op_id、session_id、outcome。 */
  op: (
    action: string,
    fields?: LogFields,
    outcome: "ok" | "err" = "ok",
  ) => {
    const opId = newOpId();
    info(
      fmt(
        "ops",
        `action=${action} op_id=${opId} outcome=${outcome}`,
        fields,
      ),
    );
    return opId;
  },
  /** FSM / 状态迁移。 */
  transition: (
    scope: string,
    from: string,
    to: string,
    reason?: string,
    fields?: LogFields,
  ) => {
    info(
      fmt(
        scope,
        `transition from=${from} to=${to}${reason ? ` reason=${reason}` : ""}`,
        fields,
      ),
    );
  },
  newOpId,
};
