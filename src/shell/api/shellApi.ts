/** 壳 IPC 薄封装：类型集中，调用点不散落 invoke 字符串。 */

import { invoke } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
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

export function ensureAndStart(): Promise<ReadyPayload> {
  if (!ensureInflight) {
    ensureInflight = invoke<ReadyPayload>("ensure_and_start").finally(() => {
      ensureInflight = null;
    });
  }
  return ensureInflight;
}

export function restartHarness(): Promise<ReadyPayload> {
  return invoke<ReadyPayload>("restart_harness");
}

export function startHarness(cmd: StartCommand): Promise<ReadyPayload> {
  return cmd === "restart_harness" ? restartHarness() : ensureAndStart();
}

export function probeEnvironment(): Promise<EnvironmentProbe> {
  return invoke<EnvironmentProbe>("probe_environment");
}

export function resolveDshHomePath(
  path: string,
  mode: "local" | "hosted",
  autoAdjust = true,
): Promise<DirResolveResult> {
  return invoke<DirResolveResult>("resolve_dsh_home_path", {
    path,
    mode,
    autoAdjust,
  });
}

export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>("get_runtime_status");
}

export function getShellSettings(): Promise<ShellSettings> {
  return invoke<ShellSettings>("get_shell_settings");
}

export function saveShellSettings(settings: ShellSettings): Promise<void> {
  return invoke("save_shell_settings", { settings });
}

export function saveRuntimeSettings(settings: RuntimeSettings): Promise<void> {
  return invoke("save_runtime_settings", { settings });
}

export function saveUiSettings(settings: UiSettings): Promise<void> {
  return invoke("save_ui_settings", { settings });
}

export function checkHarnessUpdate(): Promise<HarnessUpdateCheck> {
  return invoke<HarnessUpdateCheck>("check_harness_update");
}

export function applyHarnessUpdate(): Promise<ReadyPayload> {
  return invoke<ReadyPayload>("apply_harness_update");
}

/** 壳自更新安装前：停托管进程（须在 update.install 之前调用）。 */
export function prepareShellUpdate(): Promise<void> {
  return invoke("prepare_shell_update");
}

/** 清除 AppData harness 后重装（保留 Node；不碰 DSH_HOME）。 */
export function resetHostedRuntime(): Promise<ReadyPayload> {
  return invoke<ReadyPayload>("reset_hosted_runtime");
}

/** 以 AppData 干净 profile 会话启动（临时 DSH_HOME，不删用户 ~/.dsh）。 */
export function startCleanProfile(): Promise<ReadyPayload> {
  return invoke<ReadyPayload>("start_clean_profile");
}

/** 退出干净 profile 会话并回到正式 DSH_HOME。 */
export function exitCleanProfile(): Promise<ReadyPayload> {
  return invoke<ReadyPayload>("exit_clean_profile");
}

export function readShellLog(): Promise<string> {
  return invoke<string>("read_shell_log");
}

export type ExportDiagnosticsResult = {
  path: string;
};

export function exportDiagnostics(): Promise<ExportDiagnosticsResult> {
  return invoke<ExportDiagnosticsResult>("export_diagnostics");
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
  return Array.isArray(selected) ? (selected[0] ?? null) : selected;
}

export function openKnownPath(which: KnownPath): Promise<void> {
  return invoke("open_known_path", { which });
}

export type DownloadFinishedPayload = {
  path: string;
  success: boolean;
  url?: string | null;
};

export function revealDownloadedFile(path: string): Promise<void> {
  return invoke("reveal_downloaded_file", { path });
}

export function hideToTray(): Promise<void> {
  return invoke("hide_to_tray");
}

export function quitApp(): Promise<void> {
  return invoke("quit_app");
}

export function stopHarness(): Promise<void> {
  return invoke("stop_harness");
}

export function openLoopbackUrl(url: string): Promise<void> {
  return invoke("open_loopback_url", { url });
}

export function openPlatformWindow(): Promise<void> {
  return invoke("open_platform_window");
}

export type PlatformWebviewBounds = {
  /** shell-body 顶边距（逻辑 px） */
  top: number;
  /** 壳解析主题，与设置 → 外观一致 */
  theme: "light" | "dark";
};

export function showPlatformWebview(bounds: PlatformWebviewBounds): Promise<void> {
  return invoke("show_platform_webview", { bounds });
}

export function hidePlatformWebview(): Promise<void> {
  return invoke("hide_platform_webview");
}

/** DSH `settings.yaml` → ui-theme.preference：light | dark | system */
export function getDshThemePreference(): Promise<string> {
  return invoke<string>("get_dsh_theme_preference");
}

/** 写入 DSH 主题（与官方外观三项相同），并通知壳换肤 */
export function setDshThemePreference(preference: string): Promise<void> {
  return invoke("set_dsh_theme_preference", { preference });
}

/** DSH `settings.yaml` → locale.preference：zh | en */
export function getDshLocalePreference(): Promise<string> {
  return invoke<string>("get_dsh_locale_preference");
}

export function setDshLocalePreference(preference: string): Promise<void> {
  return invoke("set_dsh_locale_preference", { preference });
}

/** 同步托盘菜单文案（与 LocaleProvider 当前 locale 对齐）。 */
export function syncTrayLocale(preference: string): Promise<void> {
  return invoke("sync_tray_locale", { preference });
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
  return invoke<CliLinkStatus>("get_cli_link_status");
}

export function setCliLinkEnabled(enabled: boolean): Promise<CliLinkStatus> {
  return invoke<CliLinkStatus>("set_cli_link_enabled", { enabled });
}

/** OS 开机自启（真源为启动项，不落 settings.json）。 */
export function getAutostartEnabled(): Promise<boolean> {
  return isAutostartEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (enabled) await enableAutostart();
  else await disableAutostart();
}
