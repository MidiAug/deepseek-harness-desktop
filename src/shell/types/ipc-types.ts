/** 壳 ↔ Rust IPC 共用类型（camelCase 与 serde 对齐）。 */

export type ConnState = "preparing" | "loading" | "connected" | "error";

export type TitleConn = "preparing" | "connected" | "error";

/** 会话 FSM（单一真源；UI 只读 derived） */
export type SessionPhase =
  | "idle"
  | "installing"
  | "spawning"
  | "embedding"
  | "ready"
  | "failed";

export type ReadyPayload = {
  url: string;
  port: number;
};

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
  appDataDir: string;
  appDataAdjusted: boolean;
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

export type RuntimeStatus = {
  nodeReady: boolean;
  harnessReady: boolean;
  /** 入口缺失但已有依赖痕迹（中断更新等） */
  harnessPartial?: boolean;
  port: number;
  dshHome?: string;
  appData?: string;
  /** 本地 `@deepseek-ai/dsh` package.json version */
  harnessVersion?: string | null;
  /** package.json SHA-256 前 16 hex */
  harnessDigest?: string | null;
  shellVersion?: string;
  /** 当前 spawn 实际使用的 DSH_HOME（含干净 profile 会话） */
  effectiveDshHome?: string;
  cleanProfileActive?: boolean;
  runtimeSource?: "auto" | "system" | "hosted";
  activeRuntime?: "system" | "hosted" | null;
  systemRuntimeDetected?: boolean;
  systemEntry?: string | null;
};

export type HarnessUpdateCheck = {
  local: string | null;
  latest: string | null;
  updateAvailable: boolean;
};

export type ProgressPayload = {
  stage: string;
  message: string;
  percent: number | null;
};

export type StartCommand = "ensure_and_start" | "restart_harness";

export type KnownPath = "dshHome" | "appData" | "logs";

export type SidebarLayout = {
  widthPx: number;
  collapsed: boolean;
};
