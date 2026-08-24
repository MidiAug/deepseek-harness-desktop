import type { RuntimeSource } from "../settings.ts";

/** 用户显式选择的 Harness 安装方式（不含 legacy auto）。 */
export type InstallMode = "system" | "hosted";

export function resolveInstallMode(opts: {
  runtimeSource?: RuntimeSource | null;
  activeRuntime?: "system" | "hosted" | null;
}): InstallMode {
  const { runtimeSource, activeRuntime } = opts;
  if (runtimeSource === "system") return "system";
  if (runtimeSource === "hosted") return "hosted";
  if (activeRuntime === "system") return "system";
  return "hosted";
}
