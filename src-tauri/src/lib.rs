//! Tauri 入口：注册状态、命令，启动清扫与退出回收。

mod logging;
mod diagnostics;
mod error;
mod inject;
mod install;
mod net;
mod paths;
mod platform;
mod platform_window;
mod progress;
mod runtime;
mod runtime_lock;
mod settings;
mod context_menu;
mod selection_hygiene;
mod session_log_proxy;
mod dsh_theme;
mod dsh_locale;
mod dsh_settings;
mod dsh_settings_watch;
mod sidebar_probe;
mod supervise;
mod tray;
mod update;
mod cli_link;
mod shell_download;

use error::HostError;
use progress::ReadyPayload;
use settings::{RuntimeSettings, ShellSettings, UiSettings};
use supervise::HarnessState;
use update::HarnessUpdateCheck;
use tauri::{
    Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};
#[tauri::command]
async fn ensure_and_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::ipc", "ensure_and_start");
    let result = runtime::ensure_and_start(&app, &state).await;
    match &result {
        Ok(p) => log::info!(target: "shell::ipc", "ensure_and_start ok port={}", p.port),
        Err(e) => log::warn!(target: "shell::ipc", "ensure_and_start err={e}"),
    }
    result
}

#[tauri::command]
async fn restart_harness(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::ipc", "restart_harness");
    let result = runtime::restart_harness(&app, &state).await;
    match &result {
        Ok(p) => log::info!(target: "shell::ipc", "restart_harness ok port={}", p.port),
        Err(e) => log::warn!(target: "shell::ipc", "restart_harness err={e}"),
    }
    result
}

#[tauri::command]
fn stop_harness(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<(), String> {
    log::info!(target: "shell::ipc", "stop_harness");
    supervise::stop_and_clear_pid(&app, &state);
    progress::append_shell_log(&app, "[ops] stop_harness");
    Ok(())
}

/// 在资源管理器中选中已下载文件（须为存在的普通文件；`tauri-plugin-opener`）。
#[tauri::command]
fn reveal_downloaded_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    shell_download::reveal_via_ipc(&app, &path)
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

/// 打开 API 平台（切换顶栏；子 WebView 由前端量 shell-body 后 show）。
#[tauri::command]
fn open_platform_window(app: tauri::AppHandle) -> Result<(), String> {
    platform_window::open_or_focus(&app)
}

#[tauri::command]
async fn show_platform_webview(
    app: tauri::AppHandle,
    bounds: platform_window::PlatformWebviewBounds,
) -> Result<(), String> {
    // Windows：同步 command 内 add_child 会死锁主线程，须 async 在工作线程调。
    tauri::async_runtime::spawn_blocking(move || platform_window::show_webview(&app, bounds))
        .await
        .map_err(|e| format!("platform show join: {e}"))?
}

#[tauri::command]
async fn hide_platform_webview(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || platform_window::hide_webview(&app))
        .await
        .map_err(|e| format!("platform hide join: {e}"))?
}

#[tauri::command]
fn get_runtime_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<serde_json::Value, String> {
    let port = state
        .port
        .lock()
        .map(|g| *g)
        .unwrap_or_else(|_| paths::default_port());
    runtime::build_runtime_status_json(&app, &state, port)
}

#[tauri::command]
fn get_dsh_theme_preference(app: tauri::AppHandle) -> String {
    dsh_theme::preference_for_app(&app)
}

#[tauri::command]
fn set_dsh_theme_preference(app: tauri::AppHandle, preference: String) -> Result<(), String> {
    dsh_theme::set_preference_for_app(&app, &preference)
}

#[tauri::command]
fn get_dsh_locale_preference(app: tauri::AppHandle) -> String {
    dsh_locale::preference_for_app(&app)
}

#[tauri::command]
fn set_dsh_locale_preference(app: tauri::AppHandle, preference: String) -> Result<(), String> {
    dsh_locale::set_preference_for_app(&app, &preference)?;
    tray::sync_locale_pref(&app, &preference);
    Ok(())
}

#[tauri::command]
fn sync_tray_locale(app: tauri::AppHandle, preference: String) -> Result<(), String> {
    tray::sync_locale_pref(&app, &preference);
    Ok(())
}

#[tauri::command]
fn get_shell_settings(app: tauri::AppHandle) -> ShellSettings {
    settings::load(&app)
}

#[tauri::command]
fn save_shell_settings(app: tauri::AppHandle, settings: ShellSettings) -> Result<(), String> {
    log::info!(target: "shell::ipc", "save_shell_settings");
    settings::save(&app, &settings).map_err(|e| {
        log::warn!(target: "shell::ipc", "save_shell_settings err={e}");
        e
    })
}

#[tauri::command]
fn save_runtime_settings(
    app: tauri::AppHandle,
    settings: RuntimeSettings,
) -> Result<(), String> {
    log::info!(target: "shell::ipc", "save_runtime_settings");
    settings::save_runtime(&app, &settings).map_err(|e| {
        log::warn!(target: "shell::ipc", "save_runtime_settings err={e}");
        e
    })
}

#[tauri::command]
fn save_ui_settings(app: tauri::AppHandle, settings: UiSettings) -> Result<(), String> {
    log::info!(target: "shell::ipc", "save_ui_settings");
    settings::save_ui(&app, &settings).map_err(|e| {
        log::warn!(target: "shell::ipc", "save_ui_settings err={e}");
        e
    })
}

#[tauri::command]
async fn check_harness_update(app: tauri::AppHandle) -> Result<HarnessUpdateCheck, String> {
    log::info!(target: "shell::ipc", "check_harness_update");
    let result = update::check_harness_update(&app).await;
    match &result {
        Ok(c) => log::info!(
            target: "shell::ipc",
            "check_harness_update local={:?} latest={:?} available={}",
            c.local,
            c.latest,
            c.update_available
        ),
        Err(e) => log::warn!(target: "shell::ipc", "check_harness_update err={e}"),
    }
    result
}

#[tauri::command]
async fn apply_harness_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::ipc", "apply_harness_update");
    let result = update::apply_harness_update(&app, &state).await;
    match &result {
        Ok(p) => log::info!(target: "shell::ipc", "apply_harness_update ok port={}", p.port),
        Err(e) => log::warn!(target: "shell::ipc", "apply_harness_update err={e}"),
    }
    result
}

/// 壳自更新安装前：跨进程锁 + 杀托管进程树。
#[tauri::command]
async fn prepare_shell_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<(), String> {
    let _guard = state.boot_lock.lock().await;
    let _rt_lock = runtime_lock::acquire(&app, runtime_lock::LockPurpose::ShellUpdate)?;
    progress::append_shell_log(&app, "[ops] prepare_shell_update");
    progress::emit_progress(&app, "shell-update", "正在停止托管进程以便安装壳更新…", Some(10));
    supervise::stop_and_clear_pid(&app, &state);
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    progress::append_shell_log(&app, "[ops] prepare_shell_update done");
    Ok(())
}

#[tauri::command]
async fn start_clean_profile(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::ipc", "start_clean_profile");
    progress::append_shell_log(&app, "[ops] start_clean_profile");
    runtime::start_clean_profile(&app, &state).await
}

#[tauri::command]
async fn exit_clean_profile(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::ipc", "exit_clean_profile");
    progress::append_shell_log(&app, "[ops] exit_clean_profile");
    runtime::exit_clean_profile(&app, &state).await
}

/// 重置托管 harness（保留 Node；不碰 `$DSH_HOME`）后重新 ensure。
#[tauri::command]
async fn reset_hosted_runtime(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<ReadyPayload, String> {
    progress::append_shell_log(&app, "[ops] reset_hosted_runtime");
    runtime::reset_hosted_runtime(&app, &state).await
}

#[tauri::command]
fn read_shell_log(app: tauri::AppHandle) -> Result<String, String> {
    supervise::read_log_tail(&app, 8000)
}

#[tauri::command]
fn export_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<'_, HarnessState>,
) -> Result<diagnostics::ExportDiagnosticsResult, String> {
    log::info!(target: "shell::ipc", "export_diagnostics");
    diagnostics::export_diagnostics(&app, &state)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    #[cfg(desktop)]
    {
        let flags = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED;
        let _ = app.save_window_state(flags);
    }
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
    // 单实例须最先注册，二次启动才能聚焦已有窗
    let mut builder = tauri::Builder::default();
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!(target: "shell::boot", "single_instance: focus existing window");
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
    }
    let log_dir = logging::host_log_dir();
    let _ = std::fs::create_dir_all(&log_dir);
    let mut log_builder = tauri_plugin_log::Builder::new()
        .level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        })
        .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
        .max_file_size(2 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Folder {
                path: log_dir,
                file_name: Some("shell".into()),
            },
        ));
    #[cfg(debug_assertions)]
    {
        log_builder = log_builder
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Stdout,
            ))
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Webview,
            ));
    }
    let app = builder
        .plugin(log_builder.build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        // 开机自启：官方插件写 OS 启动项（Windows Run 键），免手写注册表
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .manage(HarnessState::default())
        .invoke_handler(tauri::generate_handler![
            ensure_and_start,
            restart_harness,
            stop_harness,
            open_known_path,
            reveal_downloaded_file,
            open_loopback_url,
            open_platform_window,
            show_platform_webview,
            hide_platform_webview,
            get_runtime_status,
            get_shell_settings,
            get_dsh_theme_preference,
            set_dsh_theme_preference,
            get_dsh_locale_preference,
            set_dsh_locale_preference,
            sync_tray_locale,
            save_shell_settings,
            save_runtime_settings,
            save_ui_settings,
            check_harness_update,
            apply_harness_update,
            prepare_shell_update,
            start_clean_profile,
            exit_clean_profile,
            reset_hosted_runtime,
            read_shell_log,
            export_diagnostics,
            get_cli_link_status,
            set_cli_link_enabled,
            quit_app,
            hide_to_tray
        ])
        .setup(|app| {
            log::info!(target: "shell::boot", "app setup begin");
            // 窗口改在 Rust 创建，以便挂 all-frames init（Windows 会注入 iframe）
            // windows: [] 时不会从 conf 带图标；须显式 .icon，否则 Win 任务栏为空白占位
            let url = if cfg!(debug_assertions) {
                WebviewUrl::External(
                    "http://localhost:1420"
                        .parse()
                        .expect("devUrl parse"),
                )
            } else {
                WebviewUrl::App("index.html".into())
            };
            let frame_init = inject::concat_for_all_frames();
            let mut win = WebviewWindowBuilder::new(app, "main", url)
                .title("deepseek-harness-desktop")
                .inner_size(1100.0, 720.0)
                .min_inner_size(800.0, 520.0)
                .decorations(false)
                .initialization_script_for_all_frames(frame_init);
            if let Some(icon) = app.default_window_icon() {
                win = win.icon(icon.clone())?;
            }
            let window = win
                .on_download(shell_download::handle_download_event)
                .build()?;
            #[cfg(desktop)]
            {
                let flags = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED;
                let _ = window.restore_state(flags);
            }

            supervise::sweep_orphans(app.handle());
            if let Err(e) = tray::setup_tray(app.handle()) {
                log::warn!(target: "shell::tray", "tray setup: {e}");
            }
            dsh_settings_watch::spawn_watch(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 平台子窗：正常关闭，不走主窗托盘/询问逻辑
                if window.label() == platform_window::WINDOW_LABEL {
                    return;
                }
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
            log::info!(target: "shell::boot", "app exit: stop harness");
            #[cfg(desktop)]
            {
                let flags = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED;
                let _ = app_handle.save_window_state(flags);
            }
            if let Some(state) = app_handle.try_state::<HarnessState>() {
                supervise::stop_and_clear_pid(app_handle, &state);
            }
        }
    });
}
