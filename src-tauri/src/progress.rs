//! 进度事件载荷：前端用 stage / message 展示安装状态机。
//!
//! `InstallStage` 为跨端唯一真源（wire: kebab-case）；禁止再手写任意 stage 字符串 emit。

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter, Runtime};

use crate::logging;

/// 安装 / 运维进度 stage（Rust 单一真源）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum InstallStage {
    Detect,
    DownloadNode,
    VerifyNode,
    ExtractNode,
    InstallDsh,
    UpdateDsh,
    /// npm 流式行；UI 映射到 install-dsh，且常为 log-only
    NpmLog,
    Start,
    Reset,
    Ready,
    /// 壳自更新；前端不映射到 Boot 步骤轨
    ShellUpdate,
}

impl InstallStage {
    #[allow(dead_code)] // 契约对照 / 外部工具；emit 路径用枚举变体
    pub const ALL: &[InstallStage] = &[
        Self::Detect,
        Self::DownloadNode,
        Self::VerifyNode,
        Self::ExtractNode,
        Self::InstallDsh,
        Self::UpdateDsh,
        Self::NpmLog,
        Self::Start,
        Self::Reset,
        Self::Ready,
        Self::ShellUpdate,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Detect => "detect",
            Self::DownloadNode => "download-node",
            Self::VerifyNode => "verify-node",
            Self::ExtractNode => "extract-node",
            Self::InstallDsh => "install-dsh",
            Self::UpdateDsh => "update-dsh",
            Self::NpmLog => "npm-log",
            Self::Start => "start",
            Self::Reset => "reset",
            Self::Ready => "ready",
            Self::ShellUpdate => "shell-update",
        }
    }
}

impl std::fmt::Display for InstallStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub stage: InstallStage,
    pub message: String,
    pub percent: Option<u8>,
}

#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReadyPayload {
    pub url: String,
    pub port: u16,
}

pub fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    stage: InstallStage,
    message: &str,
    percent: Option<u8>,
) {
    let stage_s = stage.as_str();
    if logging::should_log_progress_line(stage_s, message) {
        append_shell_log(app, &format!("[{stage_s}] {message}"));
    }
    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            stage,
            message: message.into(),
            percent,
        },
    );
}

/// 子进程行日志：限流写 shell.log；UI 仍逐行推送。
pub fn emit_log_line<R: Runtime>(app: &AppHandle<R>, stage: InstallStage, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    let stage_s = stage.as_str();
    if stage == InstallStage::NpmLog {
        if logging::should_log_npm_line(trimmed) {
            append_shell_log(app, &format!("[{stage_s}] {trimmed}"));
        }
    } else if logging::should_log_progress_line(stage_s, trimmed) {
        append_shell_log(app, &format!("[{stage_s}] {trimmed}"));
    }
    let _ = app.emit(
        "install-progress",
        ProgressPayload {
            stage,
            message: trimmed.into(),
            percent: None,
        },
    );
}

/// 宿主进度/运维行：经 tauri-plugin-log 落盘；dev 下同时刷终端。
pub fn append_shell_log<R: Runtime>(_app: &AppHandle<R>, line: &str) {
    log::info!(target: "shell::progress", "{line}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_stage_wire_values_stable() {
        let expected = [
            "detect",
            "download-node",
            "verify-node",
            "extract-node",
            "install-dsh",
            "update-dsh",
            "npm-log",
            "start",
            "reset",
            "ready",
            "shell-update",
        ];
        assert_eq!(InstallStage::ALL.len(), expected.len());
        for (stage, wire) in InstallStage::ALL.iter().zip(expected.iter()) {
            assert_eq!(stage.as_str(), *wire);
            let json = serde_json::to_string(stage).unwrap();
            assert_eq!(json, format!("\"{wire}\""));
        }
    }
}
