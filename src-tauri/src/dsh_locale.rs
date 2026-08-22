//! DSH 语言真源：`DSH_HOME/settings.yaml` → `locale.preference`（zh|en）。
//! 壳与官方 UI 共用；写回同一字段；变更由 `dsh_settings_watch` 推送。

use std::fs;
use std::path::Path;

use tauri::{AppHandle, Emitter, Runtime};

use crate::paths;
use crate::settings;

pub const CHANGED_EVENT: &str = "dsh-locale-changed";

/// 读 yaml 内显式 `locale.preference`；无文件或无字段时返回 `None`。
pub fn explicit_preference_from_home(dsh_home: &Path) -> Option<&'static str> {
    let path = dsh_home.join("settings.yaml");
    let Ok(text) = fs::read_to_string(&path) else {
        return None;
    };
    parse_locale_preference(&text)
}

/// IPC：显式偏好或空串（空串表示未设置，由前端做浏览器检测）。
pub fn preference_for_app<R: Runtime>(app: &AppHandle<R>) -> String {
    explicit_preference_from_home(&dsh_home_for(app))
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
    set_preference_in_home(&dsh_home_for(app), pref)?;
    let _ = app.emit(CHANGED_EVENT, pref);
    Ok(())
}

fn dsh_home_for<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    let cfg = settings::load(app);
    paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()))
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
    fs::create_dir_all(dsh_home).map_err(|e| format!("mkdir DSH_HOME: {e}"))?;
    let path = dsh_home.join("settings.yaml");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let next = upsert_locale_preference(&existing, pref);
    fs::write(&path, next).map_err(|e| format!("write settings.yaml: {e}"))?;
    Ok(())
}

pub fn upsert_locale_preference(text: &str, pref: &str) -> String {
    upsert_yaml_block_preference(text, "locale:", pref)
}

/// 仅识别 `locale:` 块内的 `preference:`。
pub fn parse_locale_preference(text: &str) -> Option<&'static str> {
    parse_yaml_block_preference(text, "locale:")
}

/// 与主题块相同的 yaml 行扫描逻辑（块名不同）。
pub fn upsert_yaml_block_preference(text: &str, block_key: &str, pref: &str) -> String {
    let mut in_block = false;
    let mut replaced = false;
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let raw = line;
        let t = raw.trim();
        if t.starts_with(block_key) {
            in_block = true;
            out.push(line.to_string());
            continue;
        }
        if in_block {
            let indented = raw.starts_with(' ') || raw.starts_with('\t');
            if !indented && t.contains(':') && !t.is_empty() {
                if !replaced {
                    out.push(format!("  preference: {pref}"));
                    replaced = true;
                }
                in_block = false;
                out.push(line.to_string());
                continue;
            }
            if t.starts_with("preference:") {
                let indent = if raw.starts_with('\t') { "\t" } else { "  " };
                out.push(format!("{indent}preference: {pref}"));
                replaced = true;
                continue;
            }
        }
        out.push(line.to_string());
    }
    if in_block && !replaced {
        out.push(format!("  preference: {pref}"));
        replaced = true;
    }
    if !replaced {
        if !out.is_empty() && !out.last().map(|s| s.is_empty()).unwrap_or(true) {
            out.push(String::new());
        }
        let block = block_key.trim_end_matches(':');
        out.push(format!("{block}:"));
        out.push(format!("  preference: {pref}"));
    }
    let mut s = out.join("\n");
    if !s.ends_with('\n') {
        s.push('\n');
    }
    s
}

pub fn parse_yaml_block_preference(text: &str, block_key: &str) -> Option<&'static str> {
    let mut in_block = false;
    for line in text.lines() {
        let raw = line;
        let t = raw.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if t.starts_with(block_key) {
            in_block = true;
            continue;
        }
        if in_block {
            let indented = raw.starts_with(' ') || raw.starts_with('\t');
            if !indented && t.contains(':') {
                break;
            }
            if let Some(rest) = t.strip_prefix("preference:") {
                let v = rest
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_ascii_lowercase();
                return match v.as_str() {
                    "zh" | "zh-cn" | "zh-hans" => Some("zh"),
                    "en" => Some("en"),
                    _ => None,
                };
            }
        }
    }
    None
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
