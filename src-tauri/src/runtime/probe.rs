//! 首跑 / 设置前环境探测（本机 dsh、Node、DSH_HOME）。

use std::path::Path;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::runtime::package::{read_harness_meta, read_harness_meta_from_system_entry, HarnessMeta};
use crate::system_runtime;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentProbe {
    pub system_runtime_detected: bool,
    pub system_node: Option<String>,
    pub system_node_version: Option<String>,
    pub system_entry: Option<String>,
    pub dsh_home_default: String,
    pub dsh_home_detected: bool,
    pub hosted_dsh_home_default: String,
    pub hosted_dsh_home_adjusted: bool,
    pub hosted_dsh_home_conflict_path: Option<String>,
    pub hosted_dsh_home_reuse_available: bool,
    pub hosted_dsh_home_reuse_path: Option<String>,
    pub app_data_dir: String,
    pub app_data_adjusted: bool,
    pub app_data_conflict_path: Option<String>,
    pub harness_version: Option<String>,
    pub harness_digest: Option<String>,
}

pub fn probe_environment<R: Runtime>(app: &AppHandle<R>) -> Result<EnvironmentProbe, String> {
    let dsh_home_default = paths::resolve_dsh_home(None);
    let dsh_home_detected = dsh_home_default.is_dir();
    let app_data = paths::resolve_app_data_dir_with_meta();
    let hosted = paths::resolve_hosted_dsh_home_with_meta(app)?;
    let hosted_primary = paths::hosted_dsh_home_primary(app)?;
    let (hosted_dsh_home_reuse_available, hosted_dsh_home_reuse_path) =
        paths::hosted_dsh_home_reuse_meta(&hosted_primary, &hosted.path);

    let system = system_runtime::resolve_system_runtime();
    let system_runtime_detected = system.is_some();
    let (system_node, system_node_version, system_entry, harness_version, harness_digest) =
        if let Some(ref rt) = system {
            let meta = read_harness_meta_from_system_entry(&rt.entry);
            (
                Some(rt.node.to_string_lossy().into_owned()),
                node_version(&rt.node),
                Some(rt.entry.to_string_lossy().into_owned()),
                meta.version,
                meta.digest,
            )
        } else {
            let hosted = read_harness_meta(app);
            (
                None,
                None,
                None,
                hosted.version,
                hosted.digest,
            )
        };

    Ok(EnvironmentProbe {
        system_runtime_detected,
        system_node,
        system_node_version,
        system_entry,
        dsh_home_default: dsh_home_default.to_string_lossy().into_owned(),
        dsh_home_detected,
        hosted_dsh_home_default: hosted.path,
        hosted_dsh_home_adjusted: hosted.adjusted,
        hosted_dsh_home_conflict_path: hosted.conflict_path,
        hosted_dsh_home_reuse_available,
        hosted_dsh_home_reuse_path,
        app_data_dir: app_data.path,
        app_data_adjusted: app_data.adjusted,
        app_data_conflict_path: app_data.conflict_path,
        harness_version,
        harness_digest,
    })
}

#[cfg(windows)]
fn node_version(node: &Path) -> Option<String> {
    let out = Command::new(node).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if v.is_empty() { None } else { Some(v) }
}

#[cfg(not(windows))]
fn node_version(_node: &Path) -> Option<String> {
    None
}
