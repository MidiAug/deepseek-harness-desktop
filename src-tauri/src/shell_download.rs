//! WebView 下载完成事件与在资源管理器中选中已下载文件。
//!
//! reveal 走官方 `tauri-plugin-opener`（Windows：`SHOpenFolderAndSelectItems`），
//! 避免手写 `explorer /select` 与 Rust `Command::arg` 引号转义冲突（rust#29494）。

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview};
use tauri_plugin_opener::OpenerExt;

use crate::error::HostError;
use crate::progress;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadFinishedPayload {
    pub path: String,
    pub success: bool,
    pub url: Option<String>,
}

struct LastDownload {
    url: String,
    destination: PathBuf,
    finished_path: Option<PathBuf>,
    at: Instant,
}

static LAST_DOWNLOAD: Mutex<Option<LastDownload>> = Mutex::new(None);
static LAST_FINISHED_EMIT: Mutex<Option<(String, Instant)>> = Mutex::new(None);

fn remember_download(url: &str, destination: PathBuf) {
    let mut guard = LAST_DOWNLOAD.lock().unwrap_or_else(|e| e.into_inner());
    log::info!(
        target: "shell::download",
        "requested url={url} destination={}",
        destination.display()
    );
    *guard = Some(LastDownload {
        url: url.to_string(),
        destination,
        finished_path: None,
        at: Instant::now(),
    });
}

fn finish_download(url: &str, finished: Option<&PathBuf>) -> Option<PathBuf> {
    let mut guard = LAST_DOWNLOAD.lock().unwrap_or_else(|e| e.into_inner());
    let resolved = if let Some(entry) = guard.as_mut() {
        entry.finished_path = finished.cloned();
        finished
            .filter(|p| p.is_file())
            .cloned()
            .or_else(|| {
                if entry.destination.is_file() {
                    Some(entry.destination.clone())
                } else {
                    None
                }
            })
    } else {
        finished.filter(|p| p.is_file()).cloned()
    };
    log::info!(
        target: "shell::download",
        "finished url={url} finished_path={} resolved={}",
        finished
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<none>".into()),
        resolved
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<none>".into()),
    );
    resolved
}

fn should_emit_finished(path: &str) -> bool {
    let mut guard = LAST_FINISHED_EMIT.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some((last_path, at)) = guard.as_ref() {
        if last_path == path && now.duration_since(*at) < Duration::from_secs(2) {
            log::debug!(target: "shell::download", "skip duplicate finished emit path={path}");
            return false;
        }
    }
    *guard = Some((path.to_string(), now));
    true
}

/// 在系统文件管理器中选中已下载文件（跨平台由 opener 插件实现）。
pub fn reveal_file_in_folder<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<(), String> {
    let exists = path.exists();
    let is_file = path.is_file();
    log::info!(
        target: "shell::download",
        "reveal path={} exists={exists} is_file={is_file}",
        path.display()
    );
    if !is_file {
        if let Ok(guard) = LAST_DOWNLOAD.lock() {
            if let Some(last) = guard.as_ref() {
                log::warn!(
                    target: "shell::download",
                    "reveal miss; last_download url={} destination={} finished={:?} age_ms={}",
                    last.url,
                    last.destination.display(),
                    last.finished_path.as_ref().map(|p| p.display().to_string()),
                    last.at.elapsed().as_millis(),
                );
            }
        }
        return Err(HostError::OpenPath(format!("不是文件: {}", path.display())).into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| HostError::OpenPath(format!("opener reveal: {e}")).into())
}

/// Tauri `on_download`：下载成功后通知前端（供 Session log 等 toast）。
pub fn handle_download_event<R: Runtime>(
    webview: Webview<R>,
    event: tauri::webview::DownloadEvent<'_>,
) -> bool {
    use tauri::webview::DownloadEvent;

    let app = webview.app_handle();
    match event {
        DownloadEvent::Requested { url, destination } => {
            remember_download(url.as_str(), destination.clone());
            progress::append_shell_log(
                app,
                &format!(
                    "[download] requested {} -> {}",
                    url.as_str(),
                    destination.display()
                ),
            );
        }
        DownloadEvent::Finished {
            url,
            path,
            success,
        } => {
            let url_str = url.as_str();
            let path_display = path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "<none>".into());
            if success {
                let resolved = finish_download(url_str, path.as_ref());
                if let Some(p) = resolved {
                    let path_str = p.to_string_lossy().into_owned();
                    if !should_emit_finished(&path_str) {
                        return true;
                    }
                    progress::append_shell_log(
                        app,
                        &format!("[download] finished ok {} -> {path_str}", url_str),
                    );
                    let payload = DownloadFinishedPayload {
                        path: path_str,
                        success: true,
                        url: Some(url_str.to_string()),
                    };
                    if let Err(e) = app.emit("shell-download-finished", payload) {
                        log::warn!(target: "shell::download", "emit shell-download-finished: {e}");
                    }
                } else {
                    log::warn!(
                        target: "shell::download",
                        "finished ok but no usable file path url={url_str} path={path_display}",
                    );
                    progress::append_shell_log(
                        app,
                        &format!(
                            "[download] finished ok but no file path {} path={path_display}",
                            url_str,
                        ),
                    );
                }
            } else {
                log::warn!(
                    target: "shell::download",
                    "finished failed url={url_str} path={path_display}",
                );
                progress::append_shell_log(
                    app,
                    &format!(
                        "[download] finished failed {} path={path_display}",
                        url_str,
                    ),
                );
            }
        }
        _ => {}
    }
    true
}

/// `reveal_downloaded_file` IPC：落盘审计 + opener reveal。
pub fn reveal_via_ipc<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    log::info!(target: "shell::download", "ipc reveal_downloaded_file path={trimmed}");
    progress::append_shell_log(app, &format!("[download] reveal {trimmed}"));
    let result = reveal_file_in_folder(app, Path::new(trimmed));
    if let Err(ref e) = result {
        log::warn!(target: "shell::download", "ipc reveal failed path={trimmed} err={e}");
        progress::append_shell_log(app, &format!("[download] reveal failed {trimmed}: {e}"));
    }
    result
}
