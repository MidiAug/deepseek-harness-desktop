//! 系统托盘：打开主窗 / 退出。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

use crate::supervise::{self, HarnessState};

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let icon = app
        .default_window_icon()
        .ok_or_else(|| "TRAY: 无默认窗口图标".to_string())?
        .clone();

    let open = MenuItem::with_id(app, "open", "打开窗口", true, None::<&str>)
        .map_err(|e| format!("TRAY: menu open: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| format!("TRAY: menu quit: {e}"))?;
    let menu = Menu::with_items(app, &[&open, &quit]).map_err(|e| format!("TRAY: menu: {e}"))?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("deepseek-harness-desktop")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| format!("TRAY: build: {e}"))?;

    Ok(())
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn quit_app<R: Runtime>(app: &AppHandle<R>) {
    if let Some(state) = app.try_state::<HarnessState>() {
        supervise::stop_and_clear_pid(app, &state);
    }
    app.exit(0);
}
