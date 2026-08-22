//! DeepSeek API 平台：主窗顶栏下子 WebView（非 iframe；站点 CSP 禁止嵌套）。

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Theme, WebviewBuilder,
    WebviewUrl,
};
use tauri::webview::Color;

pub const WINDOW_LABEL: &str = "platform";
pub const WEBVIEW_LABEL: &str = "platform-content";
pub const OPEN_EVENT: &str = "shell-open-platform";
pub const PLATFORM_URL: &str = "https://platform.deepseek.com";

static LAST_THEME: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformWebviewBounds {
    /// shell-body 顶边距（逻辑 px，由前端量取）。
    pub top: f64,
    /// 壳解析主题：light | dark（与设置 → 外观一致）。
    pub theme: String,
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window not found".into())
}

fn parse_theme(raw: &str) -> Theme {
    if raw == "light" {
        Theme::Light
    } else {
        Theme::Dark
    }
}

fn canvas_color(theme: &str) -> Color {
    if theme == "light" {
        Color(245, 245, 247, 255)
    } else {
        Color(21, 21, 23, 255)
    }
}

/// 逻辑坐标：宽 = 主窗内宽，高 = 顶栏下到窗底（配合 auto_resize 随主窗缩放）。
fn layout_bounds(main: &tauri::WebviewWindow, top_logical: f64) -> Result<Rect, String> {
    let scale = main
        .scale_factor()
        .map_err(|e| format!("platform scale: {e}"))?;
    let inner = main
        .inner_size()
        .map_err(|e| format!("platform inner_size: {e}"))?;
    let inner_logical = inner.to_logical::<f64>(scale);
    let height = (inner_logical.height - top_logical).max(0.0);
    if height <= 0.0 {
        return Err("platform layout: zero height".into());
    }
    Ok(Rect {
        position: LogicalPosition::new(0.0, top_logical).into(),
        size: LogicalSize::new(inner_logical.width, height).into(),
    })
}

fn apply_shell_theme(main: &tauri::WebviewWindow, theme: &str) -> Result<(), String> {
    let parsed = parse_theme(theme);
    main.set_theme(Some(parsed))
        .map_err(|e| format!("platform main theme: {e}"))?;
    Ok(())
}

fn theme_changed(theme: &str) -> bool {
    let mut guard = LAST_THEME.lock().unwrap_or_else(|e| e.into_inner());
    let changed = guard.as_deref() != Some(theme);
    if changed {
        *guard = Some(theme.to_string());
    }
    changed
}

fn close_if_exists(app: &AppHandle) -> Result<(), String> {
    if let Some(wv) = app.get_webview(WEBVIEW_LABEL) {
        wv.close().map_err(|e| format!("platform close: {e}"))?;
    }
    Ok(())
}

/// 在 shell-body 区域显示平台子 WebView（已存在则 set_bounds；主题变则重建）。
pub fn show_webview(app: &AppHandle, bounds: PlatformWebviewBounds) -> Result<(), String> {
    let main = main_window(app)?;
    apply_shell_theme(&main, &bounds.theme)?;
    let rect = layout_bounds(&main, bounds.top)?;

    if app.get_webview(WEBVIEW_LABEL).is_some() && theme_changed(&bounds.theme) {
        close_if_exists(app)?;
    }

    if let Some(wv) = app.get_webview(WEBVIEW_LABEL) {
        let _ = wv.set_auto_resize(true);
        wv.set_bounds(rect)
            .map_err(|e| format!("platform bounds: {e}"))?;
        wv.set_background_color(Some(canvas_color(&bounds.theme)))
            .map_err(|e| format!("platform bg: {e}"))?;
        wv.show().map_err(|e| format!("platform show: {e}"))?;
        let _ = wv.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::External(
        PLATFORM_URL
            .parse()
            .map_err(|e| format!("platform url: {e}"))?,
    );
    let builder = WebviewBuilder::new(WEBVIEW_LABEL, url)
        .auto_resize()
        .background_color(canvas_color(&bounds.theme));
    let wv = main
        .as_ref()
        .window()
        .add_child(builder, rect.position, rect.size)
        .map_err(|e| format!("platform add_child: {e}"))?;
    wv.set_bounds(rect)
        .map_err(|e| format!("platform bounds: {e}"))?;
    wv.show().map_err(|e| format!("platform show: {e}"))?;
    let _ = wv.set_focus();
    let _ = theme_changed(&bounds.theme);
    Ok(())
}

/// 关闭平台子 WebView（destroy，避免 hide 后仍盖住 harness）。
pub fn hide_webview(app: &AppHandle) -> Result<(), String> {
    close_if_exists(app)?;
    if let Ok(mut guard) = LAST_THEME.lock() {
        *guard = None;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }
    Ok(())
}

/// 关闭遗留独立子窗，并通知前端切换顶栏。
pub fn open_or_focus(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.close();
    }
    app.emit(OPEN_EVENT, ())
        .map_err(|e| format!("emit open platform: {e}"))?;
    Ok(())
}
