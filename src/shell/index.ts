export type {
  ConnState,
  HarnessUpdateCheck,
  KnownPath,
  ProgressPayload,
  ReadyPayload,
  RuntimeStatus,
  SessionPhase,
  SidebarLayout,
  StartCommand,
  TitleConn,
} from "./types/ipc-types";
export * as shellApi from "./api/shellApi";
export {
  HarnessSettingsOpsProvider,
  useHarnessSettingsOps,
} from "./hooks/useHarnessSettingsOps";
export { useShellSession } from "./hooks/useShellSession";
export { useSidebarLayout, SIDEBAR_FALLBACK_PX } from "./hooks/useSidebarLayout";
export { useHarnessContextMenu } from "./hooks/useHarnessContextMenu";
export { useShellProgressBubble } from "./hooks/useShellProgressBubble";
export { usePlatformWebview } from "./hooks/usePlatformWebview";
export { ChromeProvider, useChrome } from "./contexts/ChromeProvider";
export { LocaleProvider, useLocale, useSectionLabels } from "./locale";
export type { ShellLocale, LocaleKey } from "./locale";
export {
  HostLifecycleProvider,
  useHostLifecycle,
  type BusyReason,
  type HostLifecycleState,
} from "./contexts/HostLifecycleProvider";
export {
  ShellUpdateProvider,
  useShellUpdate,
  type ShellUpdatePhase,
  type ShellUpdateState,
} from "./contexts/ShellUpdateProvider";
export {
  BOOT_STAGES,
  mapStage,
  stageIndex,
  type BootStageId,
} from "./hostProgressMap";
export {
  getRecoveryPlan,
  parseHostErrorPrefix,
  type FaultCta,
  type FaultPrefix,
} from "./errors/recoveryMatrix";
export {
  ShellToastProvider,
  useAppToast,
} from "./contexts/ShellToastProvider";
export type { ShellToastAction, ShowToastOptions } from "./contexts/ShellToastProvider";
export { shellLog } from "./logger";
export { PLATFORM_URL } from "./settings";
