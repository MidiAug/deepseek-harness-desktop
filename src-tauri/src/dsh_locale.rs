//! DSH 语言真源：`DSH_HOME/settings.yaml` → `locale.preference`（zh|en）。
//! 壳与官方 UI 共用；写回同一字段；变更由 `dsh_settings_watch` 推送。

use std::path::Path;

use tauri::{AppHandle, Emitter, Runtime};

use crate::dsh_settings;

pub const CHANGED_EVENT: &str = "dsh-locale-changed";

/// 读 yaml 内显式 `locale.preference`；无文件或无字段时返回 `None`。
pub fn explicit_preference_from_home(dsh_home: &Path) -> Option<&'static str> {
    parse_locale_preference(&dsh_settings::read_yaml(dsh_home))
}

/// IPC：显式偏好或空串（空串表示未设置，由前端做浏览器检测）。
pub fn preference_for_app<R: Runtime>(app: &AppHandle<R>) -> String {
    explicit_preference_from_home(&dsh_settings::dsh_home_for_app(app))
        .map(|s| s.to_string())
        .unwrap_or_default()
}

/// watch / 聚合读：无显式偏好时用 `en`（与 DSH FALLBACK 一致；前端首屏会再校正）。
pub fn resolved_preference_from_home(dsh_home: &Path) -> String {
    explicit_preference_from_home(dsh_home)
        .unwrap_or("en")
        .to_string()
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

fn normalize_pref(preference: &str) -> Result<&'static str, String> {
    match preference.trim().to_ascii_lowercase().as_str() {
        "zh" | "zh-cn" | "zh-hans" => Ok("zh"),
        "en" => Ok("en"),
        other => Err(format!("未知语言 preference: {other}")),
    }
}

/// 写入或补全 `locale.preference`；尽量保留其它键与格式。
pub fn set_preference_in_home(dsh_home: &Path, preference: &str) -> Result<(), String> {
    let pref = normalize_pref(preference)?;
    let existing = dsh_settings::read_yaml(dsh_home);
    let next = upsert_locale_preference(&existing, pref);
    dsh_settings::write_yaml(dsh_home, &next)
}

pub fn upsert_locale_preference(text: &str, pref: &str) -> String {
    dsh_settings::upsert_block_preference(text, "locale:", pref)
}

/// 仅识别 `locale:` 块内的 `preference:`。
pub fn parse_locale_preference(text: &str) -> Option<&'static str> {
    let v = dsh_settings::parse_block_preference(text, "locale:")?;
    match v.as_str() {
        "zh" | "zh-cn" | "zh-hans" => Some("zh"),
        "en" => Some("en"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_zh_and_en() {
        assert_eq!(
            parse_locale_preference("locale:\n  preference: zh\n"),
            Some("zh")
        );
        assert_eq!(
            parse_locale_preference("locale:\n  preference: en\n"),
            Some("en")
        );
    }

    #[test]
    fn upsert_locale_appends_block() {
        let y = "ui-theme:\n  preference: dark\n";
        let n = upsert_locale_preference(y, "en");
        assert!(n.contains("locale:"));
        assert!(n.contains("preference: en"));
        assert!(n.contains("ui-theme:"));
    }

    #[test]
    fn upsert_locale_replaces() {
        let y = "locale:\n  preference: zh\n";
        let n = upsert_locale_preference(y, "en");
        assert!(n.contains("preference: en"));
        assert!(!n.contains("preference: zh"));
    }
}
