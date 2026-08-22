//! Tauri 入口：注册状态、命令，启动清扫与退出回收。

mod error;
mod install;
mod paths;
mod platform;
mod progress;
mod runtime;
mod settings;
mod sidebar_probe;
mod supervise;
mod tray;
mod update;
mod cli_link;

use error::HostError;
use progress::ReadyPayload;
use settings::{RuntimeSettings, ShellSettings, UiSettings};
use supervise::HarnessState;
use update::HarnessUpdateCheck;
use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
#[tauri::command]
async fn ensure_and_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    runtime::ensure_and_start(&app, &state).await
}

#[tauri::command]
async fn restart_harness(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    runtime::restart_harness(&app, &state).await
}

#[tauri::command]
fn stop_harness(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<(), String> {
    supervise::stop_and_clear_pid(&app, &state);
    progress::append_shell_log(&app, "[ops] stop_harness");
    Ok(())
}

/// 仅允许打开壳已知目录，禁止任意路径。
#[tauri::command]
fn open_known_path(app: tauri::AppHandle, which: String) -> Result<(), String> {
    let cfg = settings::load(&app);
    let path = match which.as_str() {
        "dshHome" => paths::dsh_home(&app, Some(cfg.dsh_home_override.as_str())),
        "appData" => paths::base_dir(&app)?,
        "logs" => {
            let p = paths::shell_log_file(&app)?;
            p.parent()
                .map(|x| x.to_path_buf())
                .unwrap_or(p)
        }
        _ => return Err(HostError::OpenPath(format!("未知目标 {which}")).into()),
    };
    if !path.exists() {
        std::fs::create_dir_all(&path)
            .map_err(|e| HostError::OpenPath(format!("mkdir: {e}")))?;
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| HostError::OpenPath(format!("explorer: {e}")))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err(HostError::OpenPath("仅 Windows 支持".into()).into())
    }
}

/// 仅允许本机 loopback http URL（服务地址外开）。
#[tauri::command]
fn open_loopback_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let ok = (trimmed.starts_with("http://127.0.0.1:")
        || trimmed.starts_with("http://localhost:"))
        && !trimmed.contains([' ', '\n', '\r', '\t']);
    if !ok {
        return Err("仅允许打开 http://127.0.0.1 或 localhost".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn()
            .map_err(|e| format!("open url: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("仅 Windows 支持".into())
    }
}

#[tauri::command]
fn get_runtime_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<serde_json::Value, String> {
    let node = paths::node_binary(&app)?;
    let entry = runtime::resolve_dsh_entry(&app)?;
    let cfg = settings::load(&app);
    let port = state
        .port
        .lock()
        .map(|g| *g)
        .unwrap_or_else(|_| paths::default_port());
    let meta = runtime::read_harness_meta(&app);
    let harness_ready = paths::is_file(&entry);
    Ok(serde_json::json!({
        "nodeReady": paths::is_file(&node),
        "harnessReady": harness_ready,
        "harnessPartial": !harness_ready && runtime::is_harness_partial(&app),
        "port": port,
        "dshHome": paths::dsh_home(&app, Some(cfg.dsh_home_override.as_str())).to_string_lossy(),
        "appData": paths::base_dir(&app)?.to_string_lossy(),
        "mirror": cfg.mirror,
        "proxyMode": cfg.proxy_mode,
        "dshHomeOverride": cfg.dsh_home_override,
        "closeToTray": cfg.close_to_tray,
        "harnessVersion": meta.version,
        "harnessDigest": meta.digest,
        "shellVersion": env!("CARGO_PKG_VERSION"),
    }))
}

#[tauri::command]
fn get_shell_settings(app: tauri::AppHandle) -> ShellSettings {
    settings::load(&app)
}

#[tauri::command]
fn save_shell_settings(app: tauri::AppHandle, settings: ShellSettings) -> Result<(), String> {
    settings::save(&app, &settings)
}

#[tauri::command]
fn save_runtime_settings(
    app: tauri::AppHandle,
    settings: RuntimeSettings,
) -> Result<(), String> {
    settings::save_runtime(&app, &settings)
}

#[tauri::command]
fn save_ui_settings(app: tauri::AppHandle, settings: UiSettings) -> Result<(), String> {
    settings::save_ui(&app, &settings)
}

#[tauri::command]
async fn check_harness_update(app: tauri::AppHandle) -> Result<HarnessUpdateCheck, String> {
    update::check_harness_update(&app).await
}

#[tauri::command]
async fn apply_harness_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    update::apply_harness_update(&app, &state).await
}

#[tauri::command]
fn read_shell_log(app: tauri::AppHandle) -> Result<String, String> {
    supervise::read_log_tail(&app, 8000)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    tray::quit_app(&app);
}

#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| HostError::Hide("无 main 窗口".into()))?;
    win.hide()
        .map_err(|e| HostError::Hide(format!("{e}")))?;
    Ok(())
}

#[tauri::command]
fn get_cli_link_status(app: tauri::AppHandle) -> Result<cli_link::CliLinkStatus, String> {
    Ok(cli_link::status(&app))
}

#[tauri::command]
fn set_cli_link_enabled(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<cli_link::CliLinkStatus, String> {
    let mut cfg = settings::load(&app);
    cfg.cli_link_enabled = enabled;
    settings::save(&app, &cfg)?;
    if enabled {
        cli_link::ensure(&app)?;
    } else {
        cli_link::remove(&app)?;
    }
    Ok(cli_link::status(&app))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(HarnessState::default())
        .invoke_handler(tauri::generate_handler![
            ensure_and_start,
            restart_harness,
            stop_harness,
            open_known_path,
            open_loopback_url,
            get_runtime_status,
            get_shell_settings,
            save_shell_settings,
            save_runtime_settings,
            save_ui_settings,
            check_harness_update,
            apply_harness_update,
            read_shell_log,
            get_cli_link_status,
            set_cli_link_enabled,
            quit_app,
            hide_to_tray
        ])
        .setup(|app| {
            // 窗口改在 Rust 创建，以便挂 all-frames init（Windows 会注入 iframe）
            let url = if cfg!(debug_assertions) {
                WebviewUrl::External(
                    "http://localhost:1420"
                        .parse()
                        .expect("devUrl parse"),
                )
            } else {
                WebviewUrl::App("index.html".into())
            };
            WebviewWindowBuilder::new(app, "main", url)
                .title("deepseek-harness-desktop")
                .inner_size(1100.0, 720.0)
                .min_inner_size(800.0, 520.0)
                .decorations(false)
                .initialization_script_for_all_frames(sidebar_probe::INIT_SCRIPT)
                .build()?;

            supervise::sweep_orphans(app.handle());
            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("tray setup: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let cfg = settings::load(window.app_handle());
                if !cfg.close_pref_set {
                    // 首次（或未确认偏好）：拦住关闭，让前端弹出选择
                    api.prevent_close();
                    let _ = window.app_handle().emit("shell-ask-close", ());
                    return;
                }
                if cfg.close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // else：允许关闭 → RunEvent::Exit 清扫
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<HarnessState>() {
                supervise::stop_and_clear_pid(app_handle, &state);
            }
        }
    });
}
