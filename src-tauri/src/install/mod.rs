//! 下载并安装托管 Node + `@deepseek-ai/dsh`（仅壳 AppData，非 BYO）。

mod dsh;
mod node;

pub use dsh::{force_install_dsh, npm_install_dsh_global};

use tauri::{AppHandle, Runtime};

#[cfg(not(windows))]
use crate::error::HostError;
use crate::progress::{self, InstallStage};

pub(crate) fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    stage: InstallStage,
    message: &str,
    percent: Option<u8>,
) {
    progress::emit_progress(app, stage, message, percent);
}

/// 若已存在可用 Node + dsh 入口则跳过；否则下载/安装。
pub async fn ensure_runtime_installed<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    log::info!(target: "shell::install", "ensure_runtime_installed");
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err(String::from(HostError::install("当前仅支持 Windows x64")));
    }
    #[cfg(windows)]
    {
        node::ensure_node(app).await?;
        dsh::ensure_dsh(app).await?;
        Ok(())
    }
}
