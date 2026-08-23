//! DSH 主题真源：`DSH_HOME/settings.yaml` → `ui-theme.preference`（light|dark|system）。
//! 壳与官方 UI 共用；写回同一字段；目录 watch 推送变更（无轮询）。

use std::path::Path;

use tauri::{AppHandle, Emitter, Runtime};

use crate::dsh_settings;

pub const CHANGED_EVENT: &str = "dsh-theme-changed";

/// 返回 `light` | `dark` | `system`。
pub fn preference_for_app<R: Runtime>(app: &AppHandle<R>) -> String {
    preference_from_home(&dsh_settings::dsh_home_for_app(app))
}

pub fn set_preference_for_app<R: Runtime>(
    app: &AppHandle<R>,
    preference: &str,
) -> Result<(), String> {
    let pref = normalize_pref(preference)?;
    set_preference_in_home(&dsh_settings::dsh_home_for_app(app), pref)?;
    let _ = app.emit(CHANGED_EVENT, pref);
    Ok(())
}

pub fn preference_from_home(dsh_home: &Path) -> String {
    parse_ui_theme_preference(&dsh_settings::read_yaml(dsh_home))
        .unwrap_or("system")
        .to_string()
}

fn normalize_pref(preference: &str) -> Result<&'static str, String> {
    match preference.trim().to_ascii_lowercase().as_str() {
        "light" => Ok("light"),
        "dark" => Ok("dark"),
        "system" | "follow" => Ok("system"),
        other => Err(format!("未知主题 preference: {other}")),
    }
}

/// 写入或补全 `ui-theme.preference`；尽量保留其它键与格式。
pub fn set_preference_in_home(dsh_home: &Path, preference: &str) -> Result<(), String> {
    let pref = normalize_pref(preference)?;
    let existing = dsh_settings::read_yaml(dsh_home);
    let next = upsert_ui_theme_preference(&existing, pref);
    dsh_settings::write_yaml(dsh_home, &next)
}

pub fn upsert_ui_theme_preference(text: &str, pref: &str) -> String {
    dsh_settings::upsert_block_preference(text, "ui-theme:", pref)
}

/// 仅识别 `ui-theme:` 块内的 `preference:`。
pub fn parse_ui_theme_preference(text: &str) -> Option<&'static str> {
    let v = dsh_settings::parse_block_preference(text, "ui-theme:")?;
    match v.as_str() {
        "light" => Some("light"),
        "dark" => Some("dark"),
        "system" | "follow" => Some("system"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_system_preference() {
        let y = "ui-onboarding:\n  x: 1\nui-theme:\n  preference: system\n";
        assert_eq!(parse_ui_theme_preference(y), Some("system"));
    }

    #[test]
    fn parses_light_and_dark() {
        assert_eq!(
            parse_ui_theme_preference("ui-theme:\n  preference: light\n"),
            Some("light")
        );
        assert_eq!(
            parse_ui_theme_preference("ui-theme:\n  preference: \"dark\"\n"),
            Some("dark")
        );
    }

    #[test]
    fn ignores_missing_block() {
        assert_eq!(
            parse_ui_theme_preference("agent-presets:\n  default: standard\n"),
            None
        );
    }

    #[test]
    fn upsert_replaces_existing() {
        let y = "ui-theme:\n  preference: system\n";
        let n = upsert_ui_theme_preference(y, "dark");
        assert!(n.contains("preference: dark"));
        assert!(!n.contains("preference: system"));
    }

    #[test]
    fn upsert_appends_block() {
        let y = "agent-presets:\n  default: standard\n";
        let n = upsert_ui_theme_preference(y, "light");
        assert!(n.contains("ui-theme:"));
        assert!(n.contains("preference: light"));
    }
}
