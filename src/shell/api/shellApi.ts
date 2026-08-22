/** 壳 IPC 薄封装：类型集中，调用点不散落 invoke 字符串。 */

import { invoke } from "@tauri-apps/api/core";
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

export function readShellLog(): Promise<string> {
  return invoke<string>("read_shell_log");
}

export function openKnownPath(which: KnownPath): Promise<void> {
  return invoke("open_known_path", { which });
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
