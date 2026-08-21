//! 进度事件载荷：前端用 stage / message 展示安装状态机。

use std::fs::{self, OpenOptions};
use std::io::Write;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::paths;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub stage: String,
    pub message: String,
    pub percent: Option<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyPayload {
    pub url: String,
    pub port: u16,
}

pub fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    stage: &str,
    message: &str,
    percent: Option<u8>,
) {
    append_shell_log(app, &format!("[{stage}] {message}"));
    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            stage: stage.into(),
            message: message.into(),
            percent,
        },
    );
}

/// 子进程行日志：写 shell.log 并推前端（不改总进度百分比）。
pub fn emit_log_line<R: Runtime>(app: &AppHandle<R>, stage: &str, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    append_shell_log(app, &format!("[{stage}] {trimmed}"));
    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            stage: stage.into(),
            message: trimmed.into(),
            percent: None,
        },
    );
}

/// 追加一行到 AppData/logs/shell.log（失败静默，不挡主流程）。
pub fn append_shell_log<R: Runtime>(app: &AppHandle<R>, line: &str) {
    let Ok(path) = paths::shell_log_file(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) else {
        return;
    };
    let ts = chrono_like_now();
    let _ = writeln!(f, "{ts} {line}");
}

fn chrono_like_now() -> String {
    // 避免为日志引入 chrono 依赖：本地粗时间戳即可
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix={secs}")
}
