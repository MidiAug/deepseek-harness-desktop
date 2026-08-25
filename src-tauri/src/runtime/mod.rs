//! Runtime：ensure / restart 编排；包入口解析。
//!
//! 启程语义：settings = Desired；`reconcile_to_settings` 是让 Actual 对齐 Desired 的唯一路径。

pub mod package;
mod policy;
mod probe;
mod status;
#[cfg(test)]
mod lifecycle_guard;

pub use probe::{probe_environment, EnvironmentProbe};
pub use status::{build_runtime_status, build_runtime_status_json, RuntimeStatus};

use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::install;
use crate::paths;
use crate::progress::{self, InstallStage, ReadyPayload};
use crate::runtime_lock::{self, LockPurpose};
use crate::settings;
use crate::supervise::{self, HarnessState, LaunchPlan};
use crate::system_runtime::{self, RuntimeSource};

async fn ensure_hosted_then_plan<R: Runtime>(app: &AppHandle<R>) -> Result<LaunchPlan, String> {
    install::ensure_runtime_installed(app).await?;
    LaunchPlan::hosted(app)
}

fn system_plan_or_err() -> Result<LaunchPlan, String> {
    system_runtime::resolve_system_runtime()
        .map(LaunchPlan::system)
        .ok_or_else(|| {
            String::from(HostError::install(
                "未检测到本机可用的 Node / @deepseek-ai/dsh。可在设置将「Harness 安装」改为应用内安装，或先安装官方 CLI。",
            ))
        })
}

/// 当前配置/运行态是否走本机 dsh（用于更新与元数据口径）。
pub fn uses_system_harness<R: Runtime>(app: &AppHandle<R>, state: &HarnessState) -> bool {
    if let Ok(guard) = state.active_runtime.lock() {
        if let Some(kind) = *guard {
            return kind == system_runtime::ActiveRuntimeKind::System;
        }
    }
    let cfg = settings::load(app);
    match cfg.runtime_source {
        RuntimeSource::Hosted => false,
        RuntimeSource::System => system_runtime::resolve_system_runtime().is_some(),
        RuntimeSource::Auto => system_runtime::resolve_system_runtime().is_some(),
    }
}

/// 本机 dsh：npm 全局升级到 latest 并重启（与托管 force_install 对称）。
pub async fn upgrade_system_harness<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    let _guard = state.boot_lock.lock().await;
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::HarnessUpdate)?;
    progress::emit_progress(app, InstallStage::UpdateDsh, "正在停止 harness…", Some(10));
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

    install::npm_install_dsh_global(app).await?;
    system_runtime::invalidate_system_runtime_cache();

    let plan = system_plan_or_err()?;
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(
        app,
        InstallStage::UpdateDsh,
        &format!("更新完成 · 端口 {port}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}

/// 冷启动：仅当已健康且 Actual 种类 = Desired 时复用；否则 reconcile。
pub async fn ensure_and_start<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "ensure_and_start begin");
    let _guard = state.boot_lock.lock().await;
    if let Some(ready) = try_reuse_if_matches_desired(app, state).await {
        log::info!(target: "shell::runtime", "reuse healthy port={}", ready.port);
        return Ok(ready);
    }
    progress::emit_progress(app, InstallStage::Detect, "清扫残留进程…", Some(2));
    supervise::sweep_orphans(app);
    reconcile_to_settings(app, state).await
}

/// 已健康且种类对齐 Desired 才复用；偏好已改则强制走 reconcile。
async fn try_reuse_if_matches_desired<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Option<ReadyPayload> {
    let cfg = settings::load(app);
    let system_ok = system_runtime::resolve_system_runtime().is_some();
    let desired = policy::desired_active_kind(cfg.runtime_source, system_ok)?;
    let active = state.active_runtime.lock().ok().and_then(|g| *g)?;
    if !policy::active_matches_desired(active, desired) {
        log::info!(
            target: "shell::runtime",
            "skip reuse: active={active:?} desired={desired:?} source={:?}",
            cfg.runtime_source
        );
        return None;
    }
    supervise::try_reuse_healthy(app, state).await
}

/// 按当前 settings 停旧进程并重生（hosted 缺入口时会 ensure / npm install）。
/// 调用方须已持有 `boot_lock`。
async fn reconcile_to_settings<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    progress::emit_progress(app, InstallStage::Start, "正在停止旧进程…", Some(5));
    supervise::stop_and_clear_pid(app, state);

    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Ensure)?;
    progress::emit_progress(app, InstallStage::Detect, "按当前设置解析运行时…", Some(10));

    let cfg = settings::load(app);
    let plan = resolve_launch_plan(app, &cfg).await?;
    log::info!(
        target: "shell::runtime",
        "reconcile plan kind={:?} node={} entry={}",
        plan.kind,
        plan.node.display(),
        plan.entry.display()
    );
    progress::append_shell_log(
        app,
        &format!(
            "reconcile runtimeSource={:?} → {:?} {}",
            cfg.runtime_source,
            plan.kind,
            plan.entry.display()
        ),
    );
    supervise::set_pending_launch(state, plan)?;

    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    log::info!(target: "shell::runtime", "reconcile ok port={port}");
    Ok(ReadyPayload { url, port })
}

/// 以 AppData 干净 profile 会话启动（临时 `DSH_HOME`，不删用户数据）。
pub async fn start_clean_profile<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "start_clean_profile begin");
    let _guard = state.boot_lock.lock().await;
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Ensure)?;
    progress::emit_progress(app, InstallStage::Start, "正在准备干净 profile 会话…", Some(5));
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    let dir = supervise::activate_clean_profile_session(app, state)?;
    progress::append_shell_log(
        app,
        &format!("start_clean_profile DSH_HOME={}", dir.display()),
    );
    // 干净 profile 用当前生效计划；无 pending 则按设置重解析
    let cfg = settings::load(app);
    let plan = match cfg.runtime_source {
        RuntimeSource::System => system_plan_or_err()?,
        RuntimeSource::Hosted => ensure_hosted_then_plan(app).await?,
        RuntimeSource::Auto => {
            if let Some(rt) = system_runtime::resolve_system_runtime() {
                LaunchPlan::system(rt)
            } else {
                ensure_hosted_then_plan(app).await?
            }
        }
    };
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(
        app,
        InstallStage::Ready,
        &format!("干净 profile 已就绪 · {url}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}

/// 退出干净 profile 会话，回到用户配置的 `DSH_HOME` 并重启 harness。
pub async fn exit_clean_profile<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "exit_clean_profile begin");
    let _guard = state.boot_lock.lock().await;
    supervise::deactivate_clean_profile_session(app, state);
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(
        app,
        InstallStage::Ready,
        &format!("已回到正式 profile · {url}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}

/// 清空 `DSH_HOME` 后在同一路径冷启动 harness（等价于删数据后首次 `dsh web`）。
pub async fn reset_dsh_home<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "reset_dsh_home begin");
    let _guard = state.boot_lock.lock().await;
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Reset)?;
    if supervise::is_clean_profile_active(state) {
        supervise::deactivate_clean_profile_session(app, state);
    }
    progress::emit_progress(app, InstallStage::Reset, "正在停止 harness…", Some(5));
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

    let cfg = settings::load(app);
    let home = paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()));
    paths::validate_dsh_home_reset_target(app, &home)?;
    progress::emit_progress(
        app,
        InstallStage::Reset,
        &format!("正在清空数据目录 {}…", home.display()),
        Some(25),
    );
    progress::append_shell_log(
        app,
        &format!("reset_dsh_home wipe {}", home.display()),
    );
    if home.exists() {
        fs_remove_dsh_home_retry(&home).await?;
    }
    std::fs::create_dir_all(&home).map_err(|e| {
        String::from(HostError::install(format!("mkdir DSH_HOME: {e}")))
    })?;

    let plan = resolve_launch_plan(app, &cfg).await?;
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(
        app,
        InstallStage::Ready,
        &format!("配置已重置 · {url}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}

/// 按首跑/设置记录的 Harness 安装方式重装 dsh 包（不删 DSH_HOME）。
pub async fn reinstall_dsh<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    let cfg = settings::load(app);
    match cfg.runtime_source {
        RuntimeSource::System => reinstall_system_dsh(app, state).await,
        RuntimeSource::Hosted => reset_hosted_runtime(app, state).await,
        RuntimeSource::Auto => {
            if system_runtime::resolve_system_runtime().is_some() {
                reinstall_system_dsh(app, state).await
            } else {
                reset_hosted_runtime(app, state).await
            }
        }
    }
}

async fn reinstall_system_dsh<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "reinstall_system_dsh begin");
    let _guard = state.boot_lock.lock().await;
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Reset)?;
    progress::emit_progress(app, InstallStage::Reset, "正在停止 harness…", Some(5));
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

    install::npm_install_dsh_global(app).await?;
    system_runtime::invalidate_system_runtime_cache();

    let plan = system_plan_or_err()?;
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(
        app,
        InstallStage::Ready,
        &format!("本机 dsh 已重装 · {url}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}

async fn resolve_launch_plan<R: Runtime>(
    app: &AppHandle<R>,
    cfg: &settings::ShellSettings,
) -> Result<LaunchPlan, String> {
    match cfg.runtime_source {
        RuntimeSource::Hosted => ensure_hosted_then_plan(app).await,
        RuntimeSource::System => system_plan_or_err(),
        RuntimeSource::Auto => {
            if let Some(rt) = system_runtime::resolve_system_runtime() {
                Ok(LaunchPlan::system(rt))
            } else {
                progress::emit_progress(
                    app,
                    InstallStage::Detect,
                    "未检测到本机 dsh，改用托管安装…",
                    Some(8),
                );
                ensure_hosted_then_plan(app).await
            }
        }
    }
}

/// 重置托管 harness（保留 Node runtime；不碰 `$DSH_HOME`）→ 再 ensure。
pub async fn reset_hosted_runtime<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "reset_hosted_runtime begin");
    let _guard = state.boot_lock.lock().await;
    let cfg = settings::load(app);
    if cfg.runtime_source == RuntimeSource::System {
        return Err(String::from(HostError::install(
            "当前设置为「本机已安装」，请使用「重装 DSH」或改为应用内安装。",
        )));
    }
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Reset)?;
    progress::emit_progress(app, InstallStage::Reset, "正在停止 harness…", Some(5));
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

    let harness = crate::paths::harness_dir(app)?;
    if harness.exists() {
        progress::emit_progress(app, InstallStage::Reset, "正在清除托管 harness…", Some(20));
        progress::append_shell_log(
            app,
            &format!("reset_hosted_runtime wipe {}", harness.display()),
        );
        fs_remove_dir_all_retry(&harness).await?;
    }

    progress::emit_progress(app, InstallStage::Detect, "重新安装托管运行时…", Some(40));
    let plan = ensure_hosted_then_plan(app).await?;
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(app, InstallStage::Ready, &format!("重置完成 · 端口 {port}"), Some(100));
    Ok(ReadyPayload { url, port })
}

fn is_path_in_use_error(err: &std::io::Error) -> bool {
    #[cfg(windows)]
    if let Some(code) = err.raw_os_error() {
        // ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION
        if code == 32 || code == 33 {
            return true;
        }
    }
    matches!(
        err.kind(),
        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::WouldBlock
    )
}

async fn fs_remove_dir_all_retry(path: &std::path::Path) -> Result<(), String> {
    fs_remove_dir_all_retry_for(path, |e| {
        String::from(HostError::install(format!(
            "无法删除 {}: {e}",
            path.display()
        )))
    })
    .await
}

async fn fs_remove_dsh_home_retry(path: &std::path::Path) -> Result<(), String> {
    fs_remove_dir_all_retry_for(path, |e| {
        if is_path_in_use_error(e) {
            String::from(HostError::dsh_home_in_use(format!(
                "无法清空 {}：目录可能被其他 dsh 或终端占用。请关闭占用进程后重试。",
                path.display()
            )))
        } else {
            String::from(HostError::install(format!(
                "无法清空 {}: {e}",
                path.display()
            )))
        }
    })
    .await
}

async fn fs_remove_dir_all_retry_for(
    path: &std::path::Path,
    map_final_err: impl Fn(&std::io::Error) -> String,
) -> Result<(), String> {
    for attempt in 1u8..=6 {
        match std::fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(e) if is_path_in_use_error(&e) => {
                return Err(map_final_err(&e));
            }
            Err(e) if attempt == 6 => return Err(map_final_err(&e)),
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(400 * u64::from(attempt)))
                    .await;
            }
        }
    }
    Ok(())
}

/// 重启 = reconcile：按当前 settings 重生（来源已改时会 ensure，不再沿用旧 Active）。
pub async fn restart_harness<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "restart_harness begin (reconcile)");
    let _guard = state.boot_lock.lock().await;
    reconcile_to_settings(app, state).await
}

#[cfg(test)]
mod import_hygiene {
    use std::path::Path;

    fn read_src(rel: &str) -> String {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        std::fs::read_to_string(manifest.join("src").join(rel)).unwrap_or_default()
    }

    #[test]
    fn leaf_modules_import_runtime_package() {
        for file in [
            "install/dsh.rs",
            "supervise.rs",
            "update.rs",
            "cli_link.rs",
        ] {
            let text = read_src(file);
            assert!(
                text.contains("runtime::package::"),
                "{file} should import runtime::package"
            );
            assert!(
                !text.contains("use crate::runtime::resolve_dsh_entry"),
                "{file} must not use runtime re-export for package symbols"
            );
        }
    }
}
