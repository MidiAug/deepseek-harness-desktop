//! 运行时状态 JSON（关于 / Boot 冷路径探测）。

use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::runtime::package::{is_harness_partial, read_harness_meta, resolve_dsh_entry};
use crate::settings;
use crate::supervise::{self, HarnessState};

pub fn build_runtime_status_json<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
    port: u16,
) -> Result<serde_json::Value, String> {
    let node = paths::node_binary(app)?;
    let entry = resolve_dsh_entry(app)?;
    let cfg = settings::load(app);
    let meta = read_harness_meta(app);
    let harness_ready = paths::is_file(&entry);
    let clean_profile_active = supervise::is_clean_profile_active(state);
    let effective_dsh_home = supervise::effective_dsh_home(app, state, &cfg);
    let active_runtime = state
        .active_runtime
        .lock()
        .ok()
        .and_then(|g| *g)
        .map(|k| match k {
            crate::system_runtime::ActiveRuntimeKind::System => "system",
            crate::system_runtime::ActiveRuntimeKind::Hosted => "hosted",
        });
    let system = crate::system_runtime::resolve_system_runtime();
    Ok(serde_json::json!({
        "nodeReady": paths::is_file(&node) || system.as_ref().map(|s| s.node.is_file()).unwrap_or(false),
        "harnessReady": harness_ready
            || system.as_ref().map(|s| s.entry.is_file()).unwrap_or(false),
        "harnessPartial": !harness_ready && is_harness_partial(app),
        "port": port,
        "dshHome": paths::dsh_home(app, Some(cfg.dsh_home_override.as_str())).to_string_lossy(),
        "effectiveDshHome": effective_dsh_home.to_string_lossy(),
        "cleanProfileActive": clean_profile_active,
        "appData": paths::base_dir(app)?.to_string_lossy(),
        "mirror": cfg.mirror,
        "proxyMode": cfg.proxy_mode,
        "dshHomeOverride": cfg.dsh_home_override,
        "closeToTray": cfg.close_to_tray,
        "runtimeSource": cfg.runtime_source,
        "activeRuntime": active_runtime,
        "systemRuntimeDetected": system.is_some(),
        "systemEntry": system.as_ref().map(|s| s.entry.to_string_lossy().into_owned()),
        "harnessVersion": meta.version,
        "harnessDigest": meta.digest,
        "shellVersion": env!("CARGO_PKG_VERSION"),
    }))
}
