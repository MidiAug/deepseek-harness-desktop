//! 系统托盘：打开主窗 / 退出。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Listener, Manager, Runtime,
};

use crate::dsh_locale;
use crate::paths;
use crate::settings::{self, ShellLocale};
use crate::supervise::{self, HarnessState};

const TRAY_ID: &str = "main-tray";

fn tray_labels(locale: ShellLocale) -> (&'static str, &'static str) {
    match locale {
        ShellLocale::En => ("Open window", "Quit"),
        ShellLocale::Zh => ("打开窗口", "退出"),
    }
}

fn pref_to_locale(pref: &str) -> ShellLocale {
    match pref {
        "en" => ShellLocale::En,
        _ => ShellLocale::Zh,
    }
}

fn locale_for_app<R: Runtime>(app: &AppHandle<R>) -> ShellLocale {
    let cfg = settings::load(app);
    let home = paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()));
    let pref = dsh_locale::resolved_preference_from_home(&home);
    pref_to_locale(&pref)
}

fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    locale: ShellLocale,
) -> Result<Menu<R>, String> {
    let (open_text, quit_text) = tray_labels(locale);
    let open = MenuItem::with_id(app, "open", open_text, true, None::<&str>)
        .map_err(|e| format!("TRAY: menu open: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)
        .map_err(|e| format!("TRAY: menu quit: {e}"))?;
    Menu::with_items(app, &[&open, &quit]).map_err(|e| format!("TRAY: menu: {e}"))
}

/// 与前端 LocaleProvider 对齐；重建菜单以确保 Windows 托盘文案刷新。
pub fn sync_locale<R: Runtime>(app: &AppHandle<R>, locale: ShellLocale) {
    let menu = match build_tray_menu(app, locale) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("tray rebuild menu: {e}");
            return;
        }
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Err(e) = tray.set_menu(Some(menu)) {
            eprintln!("tray set_menu: {e}");
        }
    }
}

pub fn sync_locale_pref<R: Runtime>(app: &AppHandle<R>, pref: &str) {
    sync_locale(app, pref_to_locale(pref));
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let icon = app
        .default_window_icon()
        .ok_or_else(|| "TRAY: 无默认窗口图标".to_string())?
        .clone();

    let locale = locale_for_app(app);
    let menu = build_tray_menu(app, locale)?;

    TrayIconBuilder::with_id(TRAY_ID)
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

    let app_for_listen = app.clone();
    app.listen(dsh_locale::CHANGED_EVENT, move |event| {
        sync_locale_pref(&app_for_listen, event.payload());
    });

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
