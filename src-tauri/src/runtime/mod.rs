//! Runtime：ensure / restart 编排；包入口解析。

pub mod package;
mod probe;
mod status;

pub use probe::{probe_environment, EnvironmentProbe};
pub use status::build_runtime_status_json;

use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::install;
use crate::progress::{self, ReadyPayload};
use crate::runtime_lock::{self, LockPurpose};
use crate::settings;
use crate::supervise::{self, HarnessState, LaunchPlan};
use crate::system_runtime::{self, ActiveRuntimeKind, RuntimeSource};

async fn ensure_hosted_then_plan<R: Runtime>(app: &AppHandle<R>) -> Result<LaunchPlan, String> {
    install::ensure_runtime_installed(app).await?;
    LaunchPlan::hosted(app)
}

fn system_plan_or_err() -> Result<LaunchPlan, String> {
    system_runtime::resolve_system_runtime()
        .map(LaunchPlan::system)
        .ok_or_else(|| {
            String::from(HostError::install(
                "未检测到本机可用的 Node / @deepseek-ai/dsh。可改设置「运行时来源」为自动或托管，或先安装官方 CLI。",
            ))
        })
}

/// 冷启动：清扫 →（系统或托管）→ spawn → 健康。
pub async fn ensure_and_start<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "ensure_and_start begin");
    let _guard = state.boot_lock.lock().await;
    if let Some(ready) = supervise::try_reuse_healthy(app, state).await {
        log::info!(target: "shell::runtime", "reuse healthy port={}", ready.port);
        return Ok(ready);
    }
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Ensure)?;
    progress::emit_progress(app, "detect", "清扫残留进程…", Some(2));
    supervise::sweep_orphans(app);
    progress::emit_progress(app, "detect", "检查运行时…", Some(5));

    let cfg = settings::load(app);
    let plan = match cfg.runtime_source {
        RuntimeSource::Hosted => ensure_hosted_then_plan(app).await?,
        RuntimeSource::System => system_plan_or_err()?,
        RuntimeSource::Auto => {
            if let Some(rt) = system_runtime::resolve_system_runtime() {
                LaunchPlan::system(rt)
            } else {
                progress::emit_progress(
                    app,
                    "detect",
                    "未检测到本机 dsh，改用托管安装…",
                    Some(8),
                );
                ensure_hosted_then_plan(app).await?
            }
        }
    };
    log::info!(
        target: "shell::runtime",
        "launch plan kind={:?} node={} entry={}",
        plan.kind,
        plan.node.display(),
        plan.entry.display()
    );
    progress::append_shell_log(
        app,
        &format!(
            "runtimeSource={:?} → {:?} {}",
            cfg.runtime_source,
            plan.kind,
            plan.entry.display()
        ),
    );
    supervise::set_pending_launch(state, plan)?;

    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    log::info!(target: "shell::runtime", "ensure_and_start ok port={port}");
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
    progress::emit_progress(app, "start", "正在准备干净 profile 会话…", Some(5));
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
        "ready",
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
        "ready",
        &format!("已回到正式 profile · {url}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}

/// 重置托管 harness（保留 Node runtime；不碰 `$DSH_HOME`）→ 再 ensure。
pub async fn reset_hosted_runtime<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "reset_hosted_runtime begin");
    let _guard = state.boot_lock.lock().await;
    let active = state
        .active_runtime
        .lock()
        .ok()
        .and_then(|g| *g)
        .unwrap_or(ActiveRuntimeKind::Hosted);
    if active == ActiveRuntimeKind::System {
        return Err(String::from(HostError::install(
            "当前使用本机 dsh，重置托管运行时不会改动全局包。请先在设置将「运行时来源」改为托管，或自行用 npm 管理本机 dsh。",
        )));
    }
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Reset)?;
    progress::emit_progress(app, "reset", "正在停止 harness…", Some(5));
    supervise::stop_and_clear_pid(app, state);
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

    let harness = crate::paths::harness_dir(app)?;
    if harness.exists() {
        progress::emit_progress(app, "reset", "正在清除托管 harness…", Some(20));
        progress::append_shell_log(
            app,
            &format!("reset_hosted_runtime wipe {}", harness.display()),
        );
        fs_remove_dir_all_retry(&harness).await?;
    }

    progress::emit_progress(app, "detect", "重新安装托管运行时…", Some(40));
    let plan = ensure_hosted_then_plan(app).await?;
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(app, "ready", &format!("重置完成 · 端口 {port}"), Some(100));
    Ok(ReadyPayload { url, port })
}

async fn fs_remove_dir_all_retry(path: &std::path::Path) -> Result<(), String> {
    for attempt in 1u8..=6 {
        match std::fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(e) if attempt == 6 => {
                return Err(String::from(HostError::install(format!(
                    "无法删除 harness {}: {e}",
                    path.display()
                ))));
            }
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(400 * u64::from(attempt)))
                    .await;
            }
        }
    }
    Ok(())
}

/// 重启：停旧进程 → 再 spawn（不重装）。
pub async fn restart_harness<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "restart_harness begin");
    let _guard = state.boot_lock.lock().await;
    progress::emit_progress(app, "start", "正在停止旧进程…", Some(80));
    supervise::stop_and_clear_pid(app, state);
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    log::info!(target: "shell::runtime", "restart_harness ok port={port}");
    Ok(ReadyPayload { url, port })
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
        for file in ["install.rs", "supervise.rs", "update.rs", "cli_link.rs"] {
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
