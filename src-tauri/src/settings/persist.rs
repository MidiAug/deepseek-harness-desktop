//! settings.json / ui.json 持久化与 legacy 迁移。

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::system_runtime::{self, RuntimeSource};

use super::types::{PathMeta, RuntimeSettings, ShellSettings, UiSettings};

pub(crate) fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(paths::base_dir(app)?.join("settings.json"))
}

pub(crate) fn ui_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(paths::base_dir(app)?.join("ui.json"))
}

pub(crate) fn write_json(path: &PathBuf, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir settings: {e}"))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

fn normalize_ui(ui: UiSettings) -> UiSettings {
    ui
}

/// 从旧单文件 Value 抽出 UI；有字段则返回 Some。
fn legacy_ui_from_value(v: &Value) -> Option<UiSettings> {
    let has_compact = v.get("titlebarCompact").is_some();
    let has_hygiene = v.get("selectionHygiene").is_some();
    let has_session = v.get("sessionLogInTitlebar").is_some();
    let has_style = v.get("titlebarStyle").is_some();
    if !has_compact && !has_hygiene && !has_session && !has_style {
        return None;
    }
    let mut ui = UiSettings::default();
    if let Some(c) = v.get("titlebarCompact") {
        if let Some(b) = c.as_bool() {
            ui.titlebar_compact = b;
        }
    }
    if let Some(c) = v.get("selectionHygiene") {
        if let Some(b) = c.as_bool() {
            ui.selection_hygiene = b;
        }
    }
    if let Some(c) = v.get("sessionLogInTitlebar") {
        if let Some(b) = c.as_bool() {
            ui.session_log_in_titlebar = b;
        }
    }
    Some(normalize_ui(ui))
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> ShellSettings {
    let Ok(settings_file) = settings_path(app) else {
        return ShellSettings::default();
    };
    let Ok(ui_file) = ui_path(app) else {
        return ShellSettings::default();
    };

    let mut runtime = RuntimeSettings::default();
    let mut ui = UiSettings::default();
    let mut need_migrate = false;
    let mut legacy_value: Option<Value> = None;

    if let Ok(text) = fs::read_to_string(&settings_file) {
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            legacy_value = Some(v.clone());
            if let Ok(r) = serde_json::from_value::<RuntimeSettings>(v.clone()) {
                runtime = r;
            }
            // B38 前已有 settings.json 的升级用户：视为已完成首跑
            if v.get("onboardingDone").is_none() {
                runtime.onboarding_done = true;
            }
        }
    }

    let ui_exists = ui_file.is_file();
    if ui_exists {
        if let Ok(text) = fs::read_to_string(&ui_file) {
            if let Ok(u) = serde_json::from_str::<UiSettings>(&text) {
                ui = normalize_ui(u);
            }
        }
    } else if let Some(ref v) = legacy_value {
        if let Some(legacy_ui) = legacy_ui_from_value(v) {
            ui = legacy_ui;
            need_migrate = true;
        }
    }

    if runtime.runtime_source == RuntimeSource::Auto {
        runtime.runtime_source = if system_runtime::resolve_system_runtime().is_some() {
            RuntimeSource::System
        } else {
            RuntimeSource::Hosted
        };
        need_migrate = true;
    }

    if need_migrate {
        let _ = write_json(&settings_file, &runtime);
        let _ = write_json(&ui_file, &ui);
    }

    ShellSettings::from_parts(runtime, ui)
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &ShellSettings) -> Result<(), String> {
    let settings_file = settings_path(app)?;
    let ui_file = ui_path(app)?;
    let mut runtime = settings.runtime();
    preserve_path_meta(app, &mut runtime);
    write_json(&settings_file, &runtime)?;
    write_json(&ui_file, &normalize_ui(settings.ui()))?;
    Ok(())
}

/// 仅写运行时域（settings.json），避免与 UI 即时保存互相覆盖。
pub fn save_runtime<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &RuntimeSettings,
) -> Result<(), String> {
    let mut runtime = runtime.clone();
    preserve_path_meta(app, &mut runtime);
    write_json(&settings_path(app)?, &runtime)
}

/// 前端/IPC 常不带 pathMeta；保存时从磁盘合并，避免抹掉。
fn preserve_path_meta<R: Runtime>(app: &AppHandle<R>, runtime: &mut RuntimeSettings) {
    if runtime.path_meta.is_some() {
        return;
    }
    if let Some(existing) = load(app).path_meta {
        runtime.path_meta = Some(existing);
    }
}

/// 纯合并（单测 / 无 AppHandle）。
pub(crate) fn merge_path_meta_keep_existing(
    incoming: &mut RuntimeSettings,
    existing: Option<PathMeta>,
) {
    if incoming.path_meta.is_none() {
        incoming.path_meta = existing;
    }
}

/// 仅写 UI chrome（ui.json）。
pub fn save_ui<R: Runtime>(app: &AppHandle<R>, ui: &UiSettings) -> Result<(), String> {
    write_json(&ui_path(app)?, &normalize_ui(ui.clone()))
}

fn path_meta_now() -> PathMeta {
    let resolved = paths::resolve_app_data_dir_with_meta();
    let resolved_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into());
    PathMeta {
        app_data_dir: resolved.path,
        app_data_adjusted: resolved.adjusted,
        app_data_conflict_path: resolved.conflict_path,
        resolved_at,
    }
}

/// 首启/路径变更时写入 `settings.json` 的 `pathMeta`。
pub fn ensure_path_meta<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let meta = path_meta_now();
    let mut runtime = load(app).runtime();
    let changed = runtime
        .path_meta
        .as_ref()
        .map(|m| m.app_data_dir != meta.app_data_dir)
        .unwrap_or(true);
    if changed {
        runtime.path_meta = Some(meta);
        save_runtime(app, &runtime)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::types::ShellTheme;
    use crate::settings::ShellSettings;

    #[test]
    fn legacy_ui_extracted_from_combined_json() {
        let v: Value = serde_json::from_str(
            r#"{"mirror":"domestic","proxyMode":"off","proxyUrl":"","titlebarStyle":"gray","titlebarCompact":true}"#,
        )
        .unwrap();
        let ui = legacy_ui_from_value(&v).unwrap();
        assert!(ui.titlebar_compact);
    }

    #[test]
    fn split_roundtrip_parts() {
        let s = ShellSettings {
            shell_theme: ShellTheme::Light,
            titlebar_compact: true,
            proxy_url: "http://x".into(),
            ..Default::default()
        };
        let again = ShellSettings::from_parts(s.runtime(), s.ui());
        assert_eq!(again.shell_theme, ShellTheme::System);
        assert!(again.titlebar_compact);
        assert_eq!(again.proxy_url, "http://x");
    }

    #[test]
    fn session_log_in_titlebar_defaults_true() {
        assert!(UiSettings::default().session_log_in_titlebar);
        let missing: UiSettings = serde_json::from_str(r#"{}"#).unwrap();
        assert!(missing.session_log_in_titlebar);
        let off: UiSettings =
            serde_json::from_str(r#"{"sessionLogInTitlebar":false}"#).unwrap();
        assert!(!off.session_log_in_titlebar);
    }

    #[test]
    fn runtime_roundtrip_preserves_path_meta() {
        let meta = PathMeta {
            app_data_dir: r"C:\AppData\com.deepseek.harness.desktop-shell".into(),
            app_data_adjusted: true,
            app_data_conflict_path: Some(r"C:\AppData\com.deepseek.harness.desktop".into()),
            resolved_at: "1".into(),
        };
        let s = ShellSettings {
            path_meta: Some(meta.clone()),
            ..Default::default()
        };
        let again = ShellSettings::from_parts(s.runtime(), s.ui());
        assert_eq!(again.path_meta.as_ref().unwrap().app_data_dir, meta.app_data_dir);
        assert!(again.path_meta.as_ref().unwrap().app_data_adjusted);
    }

    #[test]
    fn merge_keeps_existing_when_incoming_omits_path_meta() {
        let existing = PathMeta {
            app_data_dir: "/kept".into(),
            app_data_adjusted: true,
            app_data_conflict_path: None,
            resolved_at: "1".into(),
        };
        let mut incoming = RuntimeSettings::default();
        assert!(incoming.path_meta.is_none());
        merge_path_meta_keep_existing(&mut incoming, Some(existing.clone()));
        assert_eq!(incoming.path_meta.unwrap().app_data_dir, "/kept");

        let mut with_new = RuntimeSettings {
            path_meta: Some(PathMeta {
                app_data_dir: "/new".into(),
                app_data_adjusted: false,
                app_data_conflict_path: None,
                resolved_at: "2".into(),
            }),
            ..Default::default()
        };
        merge_path_meta_keep_existing(&mut with_new, Some(existing));
        assert_eq!(with_new.path_meta.unwrap().app_data_dir, "/new");
    }
}
