//! Runtime：ensure / restart 编排；包入口解析。

mod package;

pub use package::{is_harness_partial, read_harness_meta, resolve_dsh_entry};

use tauri::{AppHandle, Runtime};

use crate::install;
use crate::progress::{self, ReadyPayload};
use crate::supervise::{self, HarnessState};

/// 冷启动：清扫 → 安装 → spawn → 健康。
pub async fn ensure_and_start<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    let _guard = state.boot_lock.lock().await;
    // StrictMode / 重复 invoke：若已有本壳进程且 HTTP 200，直接复用，避免杀进程再 spawn。
    if let Some(ready) = supervise::try_reuse_healthy(app, state).await {
        return Ok(ready);
    }
    progress::emit_progress(app, "detect", "清扫残留进程…", Some(2));
    supervise::sweep_orphans(app);
    progress::emit_progress(app, "detect", "检查托管运行时…", Some(5));
    install::ensure_runtime_installed(app).await?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    Ok(ReadyPayload { url, port })
}

/// 重启：停旧进程 → 再 spawn（不重装）。
pub async fn restart_harness<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    let _guard = state.boot_lock.lock().await;
    progress::emit_progress(app, "start", "正在停止旧进程…", Some(80));
    supervise::stop_and_clear_pid(app, state);
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    Ok(ReadyPayload { url, port })
}
