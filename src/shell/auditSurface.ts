import type { AppStateSnapshot } from "./diagnosticsContext";
import { getAppStateSnapshot } from "./diagnosticsContext";

export type ShellAuditSnapshot = AppStateSnapshot & {
  bootFault: string | null;
  harnessIframeSrc: string | null;
};

declare global {
  interface Window {
    __dshShellAudit?: () => ShellAuditSnapshot;
  }
}

export function installShellAuditSurface(
  getExtras: () => Pick<ShellAuditSnapshot, "bootFault" | "harnessIframeSrc">,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  window.__dshShellAudit = () => ({
    ...getAppStateSnapshot(),
    ...getExtras(),
  });

  return () => {
    delete window.__dshShellAudit;
  };
}
