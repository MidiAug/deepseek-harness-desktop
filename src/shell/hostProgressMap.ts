/**
 * install-progress stage 映射（全仓唯一副本）。
 */

export const BOOT_STAGES = [
  { id: "detect", label: "检测" },
  { id: "download-node", label: "下载 Node" },
  { id: "verify-node", label: "校验" },
  { id: "extract-node", label: "解压" },
  { id: "install-dsh", label: "安装 harness" },
  { id: "start", label: "启动" },
] as const;

export type BootStageId = (typeof BOOT_STAGES)[number]["id"];

export const LOG_CAP = 200;

export function mapStage(stage: string | null): BootStageId | null {
  if (!stage) return null;
  if (stage === "npm-log") return "install-dsh";
  if (stage.startsWith("update-dsh") || stage === "install-dsh") {
    return "install-dsh";
  }
  if (stage.startsWith("download-node")) return "download-node";
  if (stage.startsWith("verify-node")) return "verify-node";
  if (stage.startsWith("extract-node")) return "extract-node";
  if (stage === "check-update") return "detect";
  if (stage.startsWith("start")) return "start";
  if (stage.startsWith("detect")) return "detect";
  const hit = BOOT_STAGES.find(
    (s) => stage.startsWith(s.id) || s.id.startsWith(stage),
  );
  return hit?.id ?? null;
}

export function stageIndex(stageId: string | null): number {
  if (!stageId) return 0;
  const i = BOOT_STAGES.findIndex((s) => s.id === stageId);
  return i >= 0 ? i : 0;
}

export function isLogOnly(stage: string): boolean {
  return stage === "npm-log";
}

export function isHeartbeat(message: string): boolean {
  return message.startsWith("…") || message.startsWith("...");
}

export function truncateProgressMessage(message: string, max = 120): string {
  return message.length > max ? `${message.slice(0, max - 1)}…` : message;
}

export function pushLogLine(prev: string[], line: string, cap = LOG_CAP): string[] {
  const t = line.trim();
  if (!t) return prev;
  if (prev[prev.length - 1] === t) return prev;
  const next =
    prev.length >= cap ? prev.slice(prev.length - cap + 1) : [...prev];
  next.push(t);
  return next;
}
