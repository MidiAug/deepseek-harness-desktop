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

export async function withInvokeAudit<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const opId = shellLog.newOpId();
  const argSummary = summarizeArgs(args);
  const t0 = performance.now();
  shellLog.info(
    "ipc",
    `invoke command=${command} op_id=${opId}${argSummary ? ` ${argSummary}` : ""}`,
  );
  try {
    const result = await invoke<T>(command, args);
    const ms = Math.round(performance.now() - t0);
    shellLog.info(
      "ipc",
      `done command=${command} op_id=${opId} outcome=ok duration_ms=${ms}`,
    );
    return result;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    shellLog.warn(
      "ipc",
      `done command=${command} op_id=${opId} outcome=err duration_ms=${ms} err=${String(e)}`,
    );
    throw e;
  }
}
