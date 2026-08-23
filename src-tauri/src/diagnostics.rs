//! 一键导出诊断包：版本、脱敏设置、路径摘要、日志尾部、运行时快照。

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::paths;
use crate::progress;
use crate::runtime::{build_runtime_status_json, package::read_harness_meta};
use crate::settings::{self, RuntimeSettings};
use crate::supervise::HarnessState;

const LOG_TAIL_CHARS: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDiagnosticsResult {
    pub path: String,
}

#[derive(Serialize)]
struct Manifest {
    exported_at: String,
    shell_version: String,
    harness_version: Option<String>,
    harness_digest: Option<String>,
    log_files: Vec<String>,
}

fn redact_runtime(rt: &RuntimeSettings) -> serde_json::Value {
    let mut v = serde_json::to_value(rt).unwrap_or(serde_json::json!({}));
    if let Some(obj) = v.as_object_mut() {
        if obj
            .get("proxyUrl")
            .and_then(|x| x.as_str())
            .is_some_and(|s| !s.trim().is_empty())
        {
            obj.insert("proxyUrl".into(), serde_json::json!("<redacted>"));
        }
    }
    v
}

fn tail_file(path: &std::path::Path, max_chars: usize) -> String {
    let text = fs::read_to_string(path).unwrap_or_default();
    if text.len() <= max_chars {
        return text;
    }
    text[text.len() - max_chars..].to_string()
}

fn reveal_in_folder(path: &PathBuf) -> Result<(), String> {
    let dir = if path.is_dir() {
        path.clone()
    } else {
        path.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| path.clone())
    };
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| HostError::OpenPath(format!("mkdir diagnostics: {e}")))?;
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| HostError::OpenPath(format!("explorer: {e}")))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        Err(HostError::OpenPath("仅 Windows 支持".into()).into())
    }
}

/// 写入 `AppData/diagnostics/diagnostic-{ts}/` 并打开所在目录。
pub fn export_diagnostics<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<ExportDiagnosticsResult, String> {
    let cfg = settings::load(app);
    let rt = cfg.runtime();
    let ui = cfg.ui();
    let meta = read_harness_meta(app);

    let base = paths::base_dir(app)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let out_dir = base.join("diagnostics").join(format!("diagnostic-{stamp}"));
    fs::create_dir_all(&out_dir)
        .map_err(|e| HostError::OpenPath(format!("mkdir {}: {e}", out_dir.display())))?;

    let log_files = vec![
        "logs/shell.log".to_string(),
        "logs/harness.log".to_string(),
    ];

    let manifest = Manifest {
        exported_at: format!("{stamp}"),
        shell_version: app.package_info().version.to_string(),
        harness_version: meta.version.clone(),
        harness_digest: meta.digest.clone(),
        log_files: log_files.clone(),
    };
    fs::write(
        out_dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("manifest json: {e}"))?,
    )
    .map_err(|e| format!("write manifest: {e}"))?;

    let settings_doc = serde_json::json!({
        "runtime": redact_runtime(&rt),
        "ui": ui,
    });
    fs::write(
        out_dir.join("settings-redacted.json"),
        serde_json::to_string_pretty(&settings_doc)
            .map_err(|e| format!("settings json: {e}"))?,
    )
    .map_err(|e| format!("write settings: {e}"))?;

    let dsh_home = paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()));
    let paths_txt = format!(
        "appData={}\nharness={}\nruntime={}\ndshHome={}\n",
        base.display(),
        paths::harness_dir(app)?.display(),
        paths::runtime_dir(app)?.display(),
        dsh_home.display(),
    );
    fs::write(out_dir.join("paths.txt"), paths_txt).map_err(|e| format!("write paths: {e}"))?;

    let port = state
        .port
        .lock()
        .map(|g| *g)
        .unwrap_or_else(|_| paths::default_port());
    let pid = state.pid.lock().ok().and_then(|g| *g);
    let mut runtime_status = build_runtime_status_json(app, port)?;
    if let Some(obj) = runtime_status.as_object_mut() {
        obj.insert("pid".into(), serde_json::json!(pid));
        obj.insert("exportedAt".into(), serde_json::json!(stamp));
    }
    fs::write(
        out_dir.join("runtime-status.json"),
        serde_json::to_string_pretty(&runtime_status)
            .map_err(|e| format!("runtime-status json: {e}"))?,
    )
    .map_err(|e| format!("write runtime-status: {e}"))?;

    let logs_dir = out_dir.join("logs");
    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("mkdir logs: {e}"))?;

    let shell_log = paths::shell_log_file(app)?;
    let shell_tail = if shell_log.exists() {
        tail_file(&shell_log, LOG_TAIL_CHARS)
    } else {
        String::new()
    };
    fs::write(logs_dir.join("shell.log"), shell_tail)
        .map_err(|e| format!("write shell.log: {e}"))?;

    let harness_log = paths::harness_log_file(app)?;
    let harness_tail = if harness_log.exists() {
        tail_file(&harness_log, LOG_TAIL_CHARS)
    } else {
        String::new()
    };
    fs::write(logs_dir.join("harness.log"), harness_tail)
        .map_err(|e| format!("write harness.log: {e}"))?;

    let path_str = out_dir.to_string_lossy().into_owned();
    progress::append_shell_log(app, &format!("[ops] export_diagnostics {path_str}"));
    reveal_in_folder(&out_dir)?;
    Ok(ExportDiagnosticsResult { path: path_str })
}
