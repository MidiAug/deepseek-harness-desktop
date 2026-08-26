export type {
  ConnState,
  EnvironmentProbe,
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
export {
  SettingsPanelProvider,
  useSettingsPanelContext,
} from "./hooks/useSettingsPanelContext";
export type { SettingsPanelContextValue } from "./hooks/useSettingsPanelContext";
export type {
  HarnessRecoveryCallbacks,
  RecoveryActionId,
  RecoveryDialogState,
  RecoverySurface,
} from "./hooks/useHarnessRecoveryActions";
export { useHarnessRecoveryActions } from "./hooks/useHarnessRecoveryActions";
export { useBootPanel } from "./hooks/useBootPanel";
export { useOnboardingWizard } from "./hooks/useOnboardingWizard";
export { useSessionLogDownload } from "./hooks/useSessionLogDownload";
export { useShellSession } from "./hooks/useShellSession";
export { useSidebarLayout, SIDEBAR_FALLBACK_PX } from "./hooks/useSidebarLayout";
export { useHarnessContextMenu } from "./hooks/useHarnessContextMenu";
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
export { resolveBootProgressDisplay } from "./bootProgressDisplay";
export {
  applyDomTheme,
  bootstrapShellTheme,
  readCachedShellTheme,
  writeCachedThemes,
} from "./themeBootstrap";
export { syncWebviewCanvasColor } from "./syncWebviewCanvas";
export {
  CTA_DESC_KEYS,
  CTA_LABEL_KEYS,
  getRecoveryPlan,
  parseFaultDisplay,
  parseHostErrorPrefix,
  type FaultCta,
  type FaultDisplay,
  type FaultPrefix,
  type RecoveryPlan,
} from "./errors";
export {
  ShellToastProvider,
  useAppToast,
} from "./contexts/ShellToastProvider";
export type { ShellToastAction, ShowToastOptions } from "./contexts/ShellToastProvider";
export { shellLog } from "./logger";
export { getShellSessionId } from "./sessionId";
export {
  buildDiagnosticsContextPayload,
  clearBootError,
  recordBootError,
  recordInjectError,
  recordRecoveryAction,
  setAppStateSnapshot,
} from "./diagnosticsContext";
export {
  setLinkedHarnessStart,
  takeLinkedHarnessStart,
} from "./sessionOpLink";
export { withInvokeAudit } from "./invokeAudit";
export {
  PLATFORM_URL,
  normalizeShellSettings,
  runtimeFromSettings,
} from "./settings";
