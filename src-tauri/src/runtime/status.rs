//! 运行时状态（关于 / Boot 冷路径探测）— 结构化返回，供 specta 导出。

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::runtime::package::{
    is_harness_partial, resolve_dsh_entry, resolve_effective_harness_meta,
};
use crate::settings::{self, MirrorKind, ProxyMode};
use crate::supervise::{self, HarnessState};
use crate::system_runtime::{ActiveRuntimeKind, RuntimeSource};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub node_ready: bool,
    pub harness_ready: bool,
    /// 入口缺失但已有依赖痕迹（中断更新等）
    pub harness_partial: bool,
    /// 壳监督的进程是否仍在跑（启停按钮真源；与 harness_ready 能力探测分离）
    pub process_running: bool,
    pub port: u16,
    pub dsh_home: String,
    pub effective_dsh_home: String,
    pub clean_profile_active: bool,
    pub app_data: String,
    pub mirror: MirrorKind,
    pub proxy_mode: ProxyMode,
    pub dsh_home_override: String,
    pub close_to_tray: bool,
    pub runtime_source: RuntimeSource,
    pub active_runtime: Option<ActiveRuntimeKind>,
    pub system_runtime_detected: bool,
    pub system_entry: Option<String>,
    pub harness_version: Option<String>,
    pub harness_digest: Option<String>,
    pub shell_version: String,
}

pub fn build_runtime_status<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
    port: u16,
) -> Result<RuntimeStatus, String> {
    let node = paths::node_binary(app)?;
    let entry = resolve_dsh_entry(app)?;
    let cfg = settings::load(app);
    let meta = resolve_effective_harness_meta(app, state);
    let harness_ready = paths::is_file(&entry);
    let clean_profile_active = supervise::is_clean_profile_active(state);
    let effective_dsh_home = supervise::effective_dsh_home(app, state, &cfg);
    let active_runtime = state.active_runtime.lock().ok().and_then(|g| *g);
    let system = crate::system_runtime::resolve_system_runtime();
    Ok(RuntimeStatus {
        node_ready: paths::is_file(&node)
            || system.as_ref().map(|s| s.node.is_file()).unwrap_or(false),
        harness_ready: harness_ready
            || system.as_ref().map(|s| s.entry.is_file()).unwrap_or(false),
        harness_partial: !harness_ready && is_harness_partial(app),
        process_running: supervise::process_is_running(state),
        port,
        dsh_home: paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()))
            .to_string_lossy()
            .into_owned(),
        effective_dsh_home: effective_dsh_home.to_string_lossy().into_owned(),
        clean_profile_active,
        app_data: paths::base_dir(app)?.to_string_lossy().into_owned(),
        mirror: cfg.mirror,
        proxy_mode: cfg.proxy_mode,
        dsh_home_override: cfg.dsh_home_override,
        close_to_tray: cfg.close_to_tray,
        runtime_source: cfg.runtime_source,
        active_runtime,
        system_runtime_detected: system.is_some(),
        system_entry: system
            .as_ref()
            .map(|s| s.entry.to_string_lossy().into_owned()),
        harness_version: meta.version,
        harness_digest: meta.digest,
        shell_version: env!("CARGO_PKG_VERSION").into(),
    })
}

/// 兼容诊断导出等仍要 `Value` 的调用方。
pub fn build_runtime_status_json<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
    port: u16,
) -> Result<serde_json::Value, String> {
    let status = build_runtime_status(app, state, port)?;
    serde_json::to_value(status).map_err(|e| e.to_string())
}
