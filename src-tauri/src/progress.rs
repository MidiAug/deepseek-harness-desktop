//! 进度事件载荷：前端用 stage / message 展示安装状态机。

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::logging;

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
    if logging::should_log_progress_line(stage, message) {
        append_shell_log(app, &format!("[{stage}] {message}"));
    }
    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            stage: stage.into(),
            message: message.into(),
            percent,
        },
    );
}

/// 子进程行日志：限流写 shell.log；UI 仍逐行推送。
pub fn emit_log_line<R: Runtime>(app: &AppHandle<R>, stage: &str, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    if stage == "npm-log" {
        if logging::should_log_npm_line(trimmed) {
            append_shell_log(app, &format!("[{stage}] {trimmed}"));
        }
    } else if logging::should_log_progress_line(stage, trimmed) {
        append_shell_log(app, &format!("[{stage}] {trimmed}"));
    }
    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            stage: stage.into(),
            message: trimmed.into(),
            percent: None,
        },
    );
}

/// 宿主进度/运维行：经 tauri-plugin-log 落盘；dev 下同时刷终端。
pub fn append_shell_log<R: Runtime>(_app: &AppHandle<R>, line: &str) {
    log::info!(target: "shell::progress", "{line}");
}
