/** 壳 ↔ Rust IPC 共用类型（camelCase 与 serde 对齐）。 */

export type {
  InstallStage,
  ProgressPayload,
  ReadyPayload,
  RuntimeStatus,
  MirrorKind,
  ProxyMode,
  RuntimeSource,
  ActiveRuntimeKind,
} from "../../bindings";

export type ConnState = "preparing" | "loading" | "connected" | "error";

export type TitleConn = "preparing" | "connected" | "error";

/** 会话 FSM（单一真源；UI 只读 derived） */
export type SessionPhase =
  | "idle"
  | "installing"
  | "spawning"
  | "embedding"
  | "ready"
  | "failed"
  /** 用户主动停止：展示 Boot 可手动启动，禁止自动 ensure */
  | "stopped";

export type EnvironmentProbe = {
  systemRuntimeDetected: boolean;
  systemNode?: string | null;
  systemNodeVersion?: string | null;
  systemEntry?: string | null;
  dshHomeDefault: string;
  dshHomeDetected: boolean;
  hostedDshHomeDefault: string;
  hostedDshHomeAdjusted: boolean;
  hostedDshHomeConflictPath?: string | null;
  hostedDshHomeReuseAvailable: boolean;
  hostedDshHomeReusePath?: string | null;
  pub appDataDir: string;
  pub appDataAdjusted: boolean;
  /** 固定后缀槽位全满时仍会落到 -emerg-*，此标志为 true */
  appDataOccupied?: boolean;
  appDataConflictPath?: string | null;
  harnessVersion?: string | null;
  harnessDigest?: string | null;
};

export type DirResolveResult = {
  path: string;
  adjusted: boolean;
  conflictPath?: string | null;
  occupied: boolean;
};

export type HarnessUpdateCheck = {
  local: string | null;
  latest: string | null;
  updateAvailable: boolean;
};

/** external_op：设置页等外部 IPC 已发起 ensure/reset，BootPanel 勿再 auto-start */
export type StartCommand =
  | "ensure_and_start"
  | "restart_harness"
  | "external_op";

export type KnownPath = "dshHome" | "appData" | "logs";

export type SidebarLayout = {
  widthPx: number;
  collapsed: boolean;
};
