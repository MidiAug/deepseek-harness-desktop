//! Harness 更新通道：查 registry latest、强制重装并重启（与 ensure「缺则装」分离）。

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::install;
use crate::net::http::http_client;
use crate::paths::DSH_PACKAGE;
use crate::progress::{self, ReadyPayload};
use crate::runtime::package::resolve_effective_harness_meta;
use crate::runtime::{upgrade_system_harness, uses_system_harness};
use crate::runtime_lock::{self, LockPurpose};
use crate::settings;
use crate::supervise::{self, HarnessState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessUpdateCheck {
    pub local: Option<String>,
    pub latest: Option<String>,
    pub update_available: bool,
}

/// 查询 registry latest，与本地 package.json version 对比。
pub async fn check_harness_update<R: Runtime>(
    app: &AppHandle<R>,
    state: &supervise::HarnessState,
) -> Result<HarnessUpdateCheck, String> {
    let cfg = settings::load(app);
    let local = resolve_effective_harness_meta(app, state).version;
    let registry = cfg.npm_registry().trim_end_matches('/');
    // `@scope/name` → `@scope%2Fname`
    let encoded = DSH_PACKAGE.replace('/', "%2F");
    let url = format!("{registry}/{encoded}/latest");

    // 轻检查：只落 shell.log，不 emit_progress（避免灌进 HostLifecycle 标题态）
    log::info!(target: "shell::update", "check_harness_update GET {url}");
    progress::append_shell_log(app, &format!("check_harness_update GET {url}"));

    let client = http_client(&cfg)?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| String::from(HostError::install(format!("查询 registry: {e}"))))?;
    if !resp.status().is_success() {
        return Err(String::from(
            HostError::install(format!("registry HTTP {} — {url}", resp.status())),
        ));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| String::from(HostError::install(format!("registry body: {e}"))))?;
    let body: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| String::from(HostError::install(format!("解析 registry JSON: {e}"))))?;
    let latest = body
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let update_available = match (&local, &latest) {
        (Some(l), Some(r)) => l != r,
        (None, Some(_)) => true,
        _ => false,
    };

    progress::append_shell_log(
        app,
        &format!(
            "check_harness_update local={:?} latest={:?} update_available={update_available}",
            local, latest
        ),
    );

    Ok(HarnessUpdateCheck {
        local,
        latest,
        update_available,
    })
}

/// 停进程 → 强制 npm install @latest → 再 spawn。
pub async fn apply_harness_update<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ReadyPayload, String> {
    progress::emit_progress(
        app,
        "update-dsh",
        "准备更新：等待获取更新锁…",
        Some(5),
    );
    let _guard = state.boot_lock.lock().await;
    if uses_system_harness(app, state) {
        return upgrade_system_harness(app, state).await;
    }
    let _rt_lock = runtime_lock::acquire(app, LockPurpose::HarnessUpdate)?;

    progress::emit_progress(app, "update-dsh", "正在停止 harness…", Some(10));
    supervise::stop_and_clear_pid(app, state);

    // Windows 上刚杀进程时 DLL/文件句柄可能尚未释放，稍等再装。
    progress::emit_progress(
        app,
        "update-dsh",
        "等待进程释放文件锁…",
        Some(20),
    );
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;

    install::force_install_dsh(app).await?;

    progress::emit_progress(app, "update-dsh", "正在重新启动 harness…", Some(92));
    let plan = crate::supervise::LaunchPlan::hosted(app)?;
    supervise::set_pending_launch(state, plan)?;
    let (port, url) = supervise::spawn_and_wait_healthy(app, state).await?;
    progress::emit_progress(
        app,
        "update-dsh",
        &format!("更新完成 · 端口 {port}"),
        Some(100),
    );
    Ok(ReadyPayload { url, port })
}
