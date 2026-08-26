/** 壳 IPC 薄封装：类型集中，调用点不散落 invoke 字符串。 */

import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { buildDiagnosticsContextPayload } from "../diagnosticsContext";
import { withInvokeAudit } from "../invokeAudit";
import { shellLog } from "../logger";
import type {
  RuntimeSettings,
  ShellSettings,
  UiSettings,
} from "../settings";
import type {
  HarnessUpdateCheck,
  KnownPath,
  ReadyPayload,
  RuntimeStatus,
  EnvironmentProbe,
  DirResolveResult,
  StartCommand,
} from "../types/ipc-types";

/** StrictMode 双挂载共享同一次 ensure，避免串行第二次清扫杀进程。 */
let ensureInflight: Promise<ReadyPayload> | null = null;

export function restartHarness(opId?: string): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>(
    "restart_harness",
    opId ? { opId } : undefined,
    opId,
  );
}

export function startHarness(cmd: StartCommand, opId?: string): Promise<ReadyPayload> {
  return cmd === "restart_harness"
    ? withInvokeAudit<ReadyPayload>("restart_harness", undefined, opId)
    : ensureAndStart(opId);
}

export function ensureAndStart(opId?: string): Promise<ReadyPayload> {
  if (!ensureInflight) {
    ensureInflight = withInvokeAudit<ReadyPayload>(
      "ensure_and_start",
      opId ? { opId } : undefined,
      opId,
    ).finally(
      () => {
        ensureInflight = null;
      },
    );
  }
  return ensureInflight;
}

export function probeEnvironment(): Promise<EnvironmentProbe> {
  return withInvokeAudit<EnvironmentProbe>("probe_environment");
}

export function resolveDshHomePath(
  path: string,
  mode: "local" | "hosted",
  autoAdjust = true,
): Promise<DirResolveResult> {
  return withInvokeAudit<DirResolveResult>("resolve_dsh_home_path", {
    path,
    mode,
    autoAdjust,
  });
}

export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return withInvokeAudit<RuntimeStatus>("get_runtime_status");
}

export function getShellSettings(): Promise<ShellSettings> {
  return withInvokeAudit<ShellSettings>("get_shell_settings");
}

export function saveShellSettings(settings: ShellSettings): Promise<void> {
  return withInvokeAudit("save_shell_settings", { settings });
}

export function saveRuntimeSettings(
  settings: RuntimeSettings,
  opId?: string,
): Promise<void> {
  return withInvokeAudit("save_runtime_settings", { settings }, opId);
}

export function saveUiSettings(settings: UiSettings, opId?: string): Promise<void> {
  return withInvokeAudit("save_ui_settings", { settings }, opId);
}

export function checkHarnessUpdate(): Promise<HarnessUpdateCheck> {
  return withInvokeAudit<HarnessUpdateCheck>("check_harness_update");
}

export function applyHarnessUpdate(): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>("apply_harness_update");
}

/** 壳自更新安装前：停托管进程（须在 update.install 之前调用）。 */
export function prepareShellUpdate(): Promise<void> {
  return withInvokeAudit("prepare_shell_update");
}

/** 清除 AppData harness 后重装（保留 Node；不碰 DSH_HOME）。 */
export function resetHostedRuntime(opId?: string): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>(
    "reset_hosted_runtime",
    opId ? { opId } : undefined,
    opId,
  );
}

/** 清空首跑选定的 DSH_HOME 并重启（删数据目录内容；不删 dsh 包）。 */
export function resetDshHome(opId?: string): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>(
    "reset_dsh_home",
    opId ? { opId } : undefined,
    opId,
  );
}

/** 探活官方 UI（Rust reqwest，不受 WebView CSP 限制）。 */
export function probeHarnessUrl(url: string): Promise<boolean> {
  return withInvokeAudit<boolean>("probe_harness_url", { url });
}

/** 按设置记录的 Harness 安装方式重装 dsh 包。 */
export function reinstallDsh(opId?: string): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>(
    "reinstall_dsh",
    opId ? { opId } : undefined,
    opId,
  );
}

/** 以 AppData 干净 profile 会话启动（临时 DSH_HOME，不删用户 ~/.dsh）。 */
export function startCleanProfile(opId?: string): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>(
    "start_clean_profile",
    opId ? { opId } : undefined,
    opId,
  );
}

/** 退出干净 profile 会话并回到正式 DSH_HOME。 */
export function exitCleanProfile(opId?: string): Promise<ReadyPayload> {
  return withInvokeAudit<ReadyPayload>(
    "exit_clean_profile",
    opId ? { opId } : undefined,
    opId,
  );
}

export function readShellLog(): Promise<string> {
  return withInvokeAudit<string>("read_shell_log");
}

export type ExportDiagnosticsResult = {
  path: string;
};

export async function syncDiagnosticsContext(): Promise<void> {
  const ctx = buildDiagnosticsContextPayload();
  await withInvokeAudit("set_diagnostics_context", {
    sessionId: ctx.sessionId,
    appState: ctx.appState,
    injectErrors: ctx.injectErrors,
  });
}

export async function exportDiagnostics(): Promise<ExportDiagnosticsResult> {
  const opId = shellLog.opBegin("diagnostics.export");
  try {
    await syncDiagnosticsContext();
    const result = await withInvokeAudit<ExportDiagnosticsResult>(
      "export_diagnostics",
      undefined,
      opId,
    );
    shellLog.opEnd(opId, "diagnostics.export", "ok");
    return result;
  } catch (e) {
    shellLog.opEnd(opId, "diagnostics.export", "err");
    throw e;
  }
}

/** 原生目录选择（首跑 DSH_HOME 等）。取消时返回 null。 */
export async function pickDirectory(
  defaultPath?: string,
): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath?.trim() || undefined,
  });
  if (selected == null) return null;
  const path = Array.isArray(selected) ? (selected[0] ?? null) : selected;
  if (path) {
    shellLog.op("dialog.pickDirectory", { ok: true });
  }
  return path;
}

export function openKnownPath(which: KnownPath): Promise<void> {
  return withInvokeAudit("open_known_path", { which });
}

export type DownloadFinishedPayload = {
  path: string;
  success: boolean;
  url?: string | null;
};

export function revealDownloadedFile(path: string): Promise<void> {
  return withInvokeAudit("reveal_downloaded_file", { path });
}

export function hideToTray(): Promise<void> {
  return withInvokeAudit("hide_to_tray");
}

export function quitApp(): Promise<void> {
  return withInvokeAudit("quit_app");
}

export function stopHarness(opId?: string): Promise<void> {
  return withInvokeAudit("stop_harness", opId ? { opId } : undefined, opId);
}

export function openLoopbackUrl(url: string): Promise<void> {
  return withInvokeAudit("open_loopback_url", { url });
}

export function openExternalUrl(url: string): Promise<void> {
  return withInvokeAudit("open_external_url", { url });
}

export function openPlatformWindow(): Promise<void> {
  return withInvokeAudit("open_platform_window");
}

export type PlatformWebviewBounds = {
  /** shell-body 顶边距（逻辑 px） */
  top: number;
  /** 壳解析主题，与设置 → 外观一致 */
  theme: "light" | "dark";
};

export function showPlatformWebview(bounds: PlatformWebviewBounds): Promise<void> {
  return withInvokeAudit("show_platform_webview", { bounds });
}

export function hidePlatformWebview(): Promise<void> {
  return withInvokeAudit("hide_platform_webview");
}

/** DSH `settings.yaml` → ui-theme.preference：light | dark | system */
export function getDshThemePreference(): Promise<string> {
  return withInvokeAudit<string>("get_dsh_theme_preference");
}

/** 写入 DSH 主题（与官方外观三项相同），并通知壳换肤 */
export function setDshThemePreference(preference: string, opId?: string): Promise<void> {
  return withInvokeAudit("set_dsh_theme_preference", { preference }, opId);
}

/** DSH `settings.yaml` → locale.preference：zh | en */
export function getDshLocalePreference(): Promise<string> {
  return withInvokeAudit<string>("get_dsh_locale_preference");
}

export function setDshLocalePreference(preference: string): Promise<void> {
  return withInvokeAudit("set_dsh_locale_preference", { preference });
}

/** 同步托盘菜单文案（与 LocaleProvider 当前 locale 对齐）。 */
export function syncTrayLocale(preference: string): Promise<void> {
  return withInvokeAudit("sync_tray_locale", { preference });
}

export { PLATFORM_URL } from "../settings";


export type CliLinkStatus = {
  enabled: boolean;
  shimExists: boolean;
  pathRegistered: boolean;
  binDir: string;
  shimPath: string;
};

export function getCliLinkStatus(): Promise<CliLinkStatus> {
  return withInvokeAudit<CliLinkStatus>("get_cli_link_status");
}

export function setCliLinkEnabled(enabled: boolean): Promise<CliLinkStatus> {
  return withInvokeAudit<CliLinkStatus>("set_cli_link_enabled", { enabled });
}

/** OS 开机自启（真源为启动项，不落 settings.json）。 */
export function getAutostartEnabled(): Promise<boolean> {
  return isAutostartEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  shellLog.op("settings.runtime.autostart", { enabled });
  if (enabled) await enableAutostart();
  else await disableAutostart();
}
