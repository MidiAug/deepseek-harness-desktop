//! Runtime：ensure / restart 编排；包入口解析。

mod package;
mod status;

pub use package::{
    assert_harness_closure, is_harness_partial, read_harness_meta, resolve_dsh_entry,
};
pub use status::build_runtime_status_json;

use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::install;
use crate::progress::{self, ReadyPayload};
use crate::runtime_lock::{self, LockPurpose};
use crate::supervise::{self, HarnessState};

/// 冷启动：清扫 → 安装 → spawn → 健康。
pub async fn ensure_and_start<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "ensure_and_start begin");
    let _guard = state.boot_lock.lock().await;
    // StrictMode / 重复 invoke：若已有本壳进程且 HTTP 200，直接复用，避免杀进程再 spawn。
    if let Some(ready) = supervise::try_reuse_healthy(app, state).await {
        log::info!(target: "shell::runtime", "reuse healthy port={}", ready.port);
        return Ok(ready);
    }
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::Ensure)?;
    progress::emit_progress(app, "detect", "清扫残留进程…", Some(2));
    supervise::sweep_orphans(app);
    progress::emit_progress(app, "detect", "检查托管运行时…", Some(5));
    install::ensure_runtime_installed(app).await?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    log::info!(target: "shell::runtime", "ensure_and_start ok port={port}");
    Ok(ReadyPayload { url, port })
}

/// 重置托管 harness（保留 Node runtime；不碰 `$DSH_HOME`）→ 再 ensure。
pub async fn reset_hosted_runtime<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    log::info!(target: "shell::runtime", "reset_hosted_runtime begin");
    let _guard = state.boot_lock.lock().await;
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
    install::ensure_runtime_installed(app).await?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(app, "ready", &format!("重置完成 · 端口 {port}"), Some(100));
    Ok(ReadyPayload { url, port })
}

async fn fs_remove_dir_all_retry(path: &std::path::Path) -> Result<(), String> {
    for attempt in 1u8..=6 {
        match std::fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(e) if attempt == 6 => {
                return Err(String::from(
                    HostError::install(format!(
                        "无法删除 harness {}: {e}",
                        path.display()
                    )),
                ));
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
