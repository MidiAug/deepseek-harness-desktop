//! DeepSeek API 平台：由前端主区 iframe 承载；此模块只关旧子窗并通知前端。

use tauri::{AppHandle, Emitter, Manager};

pub const WINDOW_LABEL: &str = "platform";
pub const OPEN_EVENT: &str = "shell-open-platform";

/// 关闭遗留 B14 子窗，并 emit 让壳切换主区内嵌。
pub fn open_or_focus(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.close();
    }
    app.emit(OPEN_EVENT, ())
        .map_err(|e| format!("emit open platform: {e}"))?;
    Ok(())
}
