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
export { useShellSession } from "./hooks/useShellSession";
export { useSidebarLayout, SIDEBAR_FALLBACK_PX } from "./hooks/useSidebarLayout";
export { useShellProgressBubble } from "./hooks/useShellProgressBubble";
export { ChromeProvider, useChrome } from "./contexts/ChromeProvider";
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
export { PLATFORM_URL } from "./settings";
