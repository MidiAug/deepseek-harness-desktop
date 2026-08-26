/** 壳 chrome 统一日志：经 tauri-plugin-log 落盘；dev 下 attachConsole 可见。 */

import { invoke } from "@tauri-apps/api/core";
import { debug, info, warn, error } from "@tauri-apps/plugin-log";
import { getShellSessionId } from "./sessionId";

const lastAt = new Map<string, number>();
const dedupeAt = new Map<string, number>();

export type LogFields = Record<string, string | number | boolean | null | undefined>;
export type OpOutcome = "ok" | "err" | "pending";

function allowKey(key: string, intervalMs: number): boolean {
  const now = Date.now();
  const prev = lastAt.get(key) ?? 0;
  if (now - prev < intervalMs) return false;
  lastAt.set(key, now);
  return true;
}

/** dev StrictMode 双挂载：同 scope+msg 50ms 内只记一次。 */
function allowDevDedupe(scope: string, msg: string): boolean {
  if (!import.meta.env.DEV) return true;
  const key = `${scope}|${msg}`;
  const now = Date.now();
  const prev = dedupeAt.get(key) ?? 0;
  if (now - prev < 50) return false;
  dedupeAt.set(key, now);
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
  return `[ui::${scope}] session_id=${sid}${formatFields(fields)} ${msg}`.trim();
}

function pushUiOpRing(
  action: string,
  opId: string,
  outcome: OpOutcome,
  fields?: LogFields,
): void {
  const sid = getShellSessionId();
  const line =
    `session_id=${sid} action=${action} op_id=${opId} outcome=${outcome}${formatFields(fields)}`.trim();
  void invoke("record_ui_op", { line }).catch(() => {
    /* ring 写入失败不挡 UI */
  });
}

function writeLog(
  level: "debug" | "info" | "warn" | "error",
  scope: string,
  msg: string,
  fields?: LogFields,
) {
  if (!allowDevDedupe(scope, msg)) return;
  const formatted = fmt(scope, msg, fields);
  switch (level) {
    case "debug":
      void debug(formatted);
      break;
    case "info":
      void info(formatted);
      break;
    case "warn":
      void warn(formatted);
      break;
    case "error":
      void error(formatted);
      break;
  }
}

function writeOp(
  action: string,
  opId: string,
  outcome: OpOutcome,
  fields?: LogFields,
) {
  writeLog(
    outcome === "err" ? "error" : "info",
    "ops",
    `action=${action} op_id=${opId} outcome=${outcome}`,
    fields,
  );
  pushUiOpRing(action, opId, outcome, fields);
}

export const shellLog = {
  debug: (scope: string, msg: string, fields?: LogFields) =>
    writeLog("debug", scope, msg, fields),
  info: (scope: string, msg: string, fields?: LogFields) =>
    writeLog("info", scope, msg, fields),
  infoThrottled: (scope: string, msg: string, intervalMs = 2000, fields?: LogFields) => {
    const key = `i:${scope}:${msg}`;
    if (allowKey(key, intervalMs)) writeLog("info", scope, msg, fields);
  },
  warn: (scope: string, msg: string, fields?: LogFields) =>
    writeLog("warn", scope, msg, fields),
  error: (scope: string, msg: string, err?: unknown, fields?: LogFields) => {
    const errPart = err != null ? `: ${String(err)}` : "";
    writeLog("error", scope, `${msg}${errPart}`, fields);
  },
  /** 同步完成的用户操作（立即 ok/err）。 */
  op: (
    action: string,
    fields?: LogFields,
    outcome: "ok" | "err" = "ok",
    opId?: string,
  ) => {
    const id = opId ?? newOpId();
    writeOp(action, id, outcome, fields);
    return id;
  },
  /** 异步操作开始：outcome=pending。 */
  opBegin: (action: string, fields?: LogFields, opId?: string) => {
    const id = opId ?? newOpId();
    writeOp(action, id, "pending", fields);
    return id;
  },
  /** 异步操作结束：outcome=ok|err。 */
  opEnd: (
    opId: string,
    action: string,
    outcome: "ok" | "err",
    fields?: LogFields,
  ) => {
    writeOp(action, opId, outcome, fields);
  },
  /** FSM / 状态迁移；session  scope 同时写入 ops ring。 */
  transition: (
    scope: string,
    from: string,
    to: string,
    reason?: string,
    fields?: LogFields,
  ) => {
    const reasonPart = reason ? ` reason=${reason}` : "";
    writeLog(
      "info",
      scope,
      `transition from=${from} to=${to}${reasonPart}`,
      fields,
    );
    if (scope === "session") {
      const phaseFields: LogFields = {
        from,
        to,
        ...(reason ? { reason } : {}),
        ...fields,
      };
      pushUiOpRing("session.phase", newOpId(), "ok", phaseFields);
    }
  },
  newOpId,
};
