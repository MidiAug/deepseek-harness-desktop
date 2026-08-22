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
} from "./ipc-types";
export * as shellApi from "./shellApi";
export { useShellSession } from "./useShellSession";
export { useSidebarLayout, SIDEBAR_FALLBACK_PX } from "./useSidebarLayout";
export { useShellProgressBubble } from "./useShellProgressBubble";
export { ChromeProvider, useChrome } from "./ChromeProvider";
export {
  HostLifecycleProvider,
  useHostLifecycle,
  type BusyReason,
  type HostLifecycleState,
} from "./HostLifecycleProvider";
export {
  ShellUpdateProvider,
  useShellUpdate,
  type ShellUpdatePhase,
  type ShellUpdateState,
} from "./ShellUpdateProvider";
export {
  BOOT_STAGES,
  mapStage,
  stageIndex,
  type BootStageId,
} from "./hostProgressMap";
