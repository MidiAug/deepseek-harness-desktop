/** IPC invoke 审计：duration + outcome + 脱敏参数摘要。 */

import { invoke } from "@tauri-apps/api/core";
import { shellLog } from "./logger";

const REDACT_KEYS = new Set([
  "proxyUrl",
  "proxy_url",
  "settings",
  "password",
  "token",
]);

/** 只读查询：降级 debug，避免设置打开等路径刷屏。 */
const READ_ONLY_COMMANDS = new Set([
  "get_shell_settings",
  "get_runtime_status",
  "get_dsh_theme_preference",
  "get_dsh_locale_preference",
  "get_cli_link_status",
  "probe_environment",
  "probe_harness_url",
  "read_shell_log",
  "check_harness_update",
]);

const IPC_DEDUPE_MS = 2000;
const lastIpcAt = new Map<string, number>();

function summarizeArgs(args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (REDACT_KEYS.has(k)) {
      parts.push(`${k}=<redacted>`);
      continue;
    }
    if (v == null) continue;
    if (typeof v === "object") {
      parts.push(`${k}=<object>`);
      continue;
    }
    const s = String(v);
    parts.push(`${k}=${s.length > 80 ? `${s.slice(0, 77)}…` : s}`);
  }
  return parts.join(" ");
}

function shouldLogIpc(command: string): boolean {
  if (command === "hide_platform_webview") {
    const now = Date.now();
    const prev = lastIpcAt.get(command) ?? 0;
    if (now - prev < IPC_DEDUPE_MS) return false;
    lastIpcAt.set(command, now);
  }
  return true;
}

function ipcLevel(command: string): "debug" | "info" {
  return READ_ONLY_COMMANDS.has(command) ? "debug" : "info";
}

export async function withInvokeAudit<T>(
  command: string,
  args?: Record<string, unknown>,
  opId?: string,
): Promise<T> {
  const auditOpId = opId ?? shellLog.newOpId();
  const argSummary = summarizeArgs(args);
  const t0 = performance.now();
  if (shouldLogIpc(command)) {
    const msg = `invoke command=${command} op_id=${auditOpId}${argSummary ? ` ${argSummary}` : ""}`;
    if (ipcLevel(command) === "debug") {
      shellLog.debug("ipc", msg);
    } else {
      shellLog.info("ipc", msg);
    }
  }
  try {
    const result = await invoke<T>(command, args);
    const ms = Math.round(performance.now() - t0);
    if (shouldLogIpc(command)) {
      const doneMsg = `done command=${command} op_id=${auditOpId} outcome=ok duration_ms=${ms}`;
      if (ipcLevel(command) === "debug") {
        shellLog.debug("ipc", doneMsg);
      } else {
        shellLog.info("ipc", doneMsg);
      }
    }
    return result;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    shellLog.warn(
      "ipc",
      `done command=${command} op_id=${auditOpId} outcome=err duration_ms=${ms} err=${String(e)}`,
    );
    throw e;
  }
}
