/** 壳 webview 进程级 session_id，用于日志关联。 */

const KEY = "dsh.shell.sessionId";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getShellSessionId(): string {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = newId();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return newId();
  }
}
