//! 运行时状态 JSON（关于 / Boot 冷路径探测）。

use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::runtime::package::{is_harness_partial, read_harness_meta, resolve_dsh_entry};
use crate::settings;

pub fn build_runtime_status_json<R: Runtime>(
    app: &AppHandle<R>,
    port: u16,
) -> Result<serde_json::Value, String> {
    let node = paths::node_binary(app)?;
    let entry = resolve_dsh_entry(app)?;
    let cfg = settings::load(app);
    let meta = read_harness_meta(app);
    let harness_ready = paths::is_file(&entry);
    Ok(serde_json::json!({
        "nodeReady": paths::is_file(&node),
        "harnessReady": harness_ready,
        "harnessPartial": !harness_ready && is_harness_partial(app),
        "port": port,
        "dshHome": paths::dsh_home(&app, Some(cfg.dsh_home_override.as_str())).to_string_lossy(),
        "appData": paths::base_dir(app)?.to_string_lossy(),
        "mirror": cfg.mirror,
        "proxyMode": cfg.proxy_mode,
        "dshHomeOverride": cfg.dsh_home_override,
        "closeToTray": cfg.close_to_tray,
        "harnessVersion": meta.version,
        "harnessDigest": meta.digest,
        "shellVersion": env!("CARGO_PKG_VERSION"),
    }))
}
