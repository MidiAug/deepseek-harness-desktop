/**
 * install-progress stage 映射。
 * Wire 真源：Rust `InstallStage`（kebab-case）→ specta `bindings.ts`。
 * UI 投影：本文件一份 `INSTALL_STAGE_TO_BOOT`（`satisfies Record` 编译期穷尽）。
 */

import type { LocaleKey } from "./locale";
import type { InstallStage } from "../bindings";

export const BOOT_STAGES = [
  { id: "detect", labelKey: "boot.stage.detect" },
  { id: "download-node", labelKey: "boot.stage.download-node" },
  { id: "verify-node", labelKey: "boot.stage.verify-node" },
  { id: "extract-node", labelKey: "boot.stage.extract-node" },
  { id: "install-dsh", labelKey: "boot.stage.install-dsh" },
  { id: "start", labelKey: "boot.stage.start" },
] as const satisfies ReadonlyArray<{ id: string; labelKey: LocaleKey }>;

export type BootStageId = (typeof BOOT_STAGES)[number]["id"];

/**
 * 每个正式 `InstallStage` → Boot 步骤轨（含故意 null）。
 * 漏键 / 多余键 → tsc 失败（勿再手抄平行数组）。
 */
export const INSTALL_STAGE_TO_BOOT = {
  detect: "detect",
  "download-node": "download-node",
  "verify-node": "verify-node",
  "extract-node": "extract-node",
  "install-dsh": "install-dsh",
  "update-dsh": "install-dsh",
  "npm-log": "install-dsh",
  start: "start",
  reset: "detect",
  ready: null,
  "shell-update": null,
} as const satisfies Record<InstallStage, BootStageId | null>;

/**
 * 已不再由 Rust emit 的历史 wire 别名（显式兼容，禁止模糊 startsWith）。
 * 新别名只加本表 + 单测；勿恢复前缀启发式。
 */
export const DEPRECATED_STAGE_ALIASES: Readonly<
  Record<string, BootStageId | null>
> = {
  "check-update": "detect",
  "update-dsh-check": "install-dsh",
  "start-harness": "start",
  "verify-node-sha": "verify-node",
};

export const LOG_CAP = 200;

function isInstallStage(stage: string): stage is InstallStage {
  return Object.prototype.hasOwnProperty.call(INSTALL_STAGE_TO_BOOT, stage);
}

/**
 * 将 wire stage 投影到 Boot 步骤轨。
 * 顺序：null → 废弃别名 → 正式 InstallStage 表 → 未知 null。
 */
export function mapStage(stage: string | null): BootStageId | null {
  if (!stage) return null;
  if (Object.prototype.hasOwnProperty.call(DEPRECATED_STAGE_ALIASES, stage)) {
    return DEPRECATED_STAGE_ALIASES[stage] ?? null;
  }
  if (isInstallStage(stage)) {
    return INSTALL_STAGE_TO_BOOT[stage];
  }
  return null;
}

/** F-stage：正式枚举投影与表一致。 */
export function mapStageCoverage(stage: InstallStage): BootStageId | null {
  return INSTALL_STAGE_TO_BOOT[stage];
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
