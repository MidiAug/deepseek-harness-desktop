//! DSH `settings.yaml` 共享读写与块级 `preference:` 扫描（theme/locale 共用）。

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::settings;

pub fn dsh_home_for_app<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    let cfg = settings::load(app);
    paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()))
}

pub fn read_yaml(dsh_home: &Path) -> String {
    let path = dsh_home.join("settings.yaml");
    fs::read_to_string(&path).unwrap_or_default()
}

pub fn write_yaml(dsh_home: &Path, content: &str) -> Result<(), String> {
    fs::create_dir_all(dsh_home).map_err(|e| format!("mkdir DSH_HOME: {e}"))?;
    let path = dsh_home.join("settings.yaml");
    fs::write(&path, content).map_err(|e| format!("write settings.yaml: {e}"))?;
    Ok(())
}

/// 识别 `block_key:` 块内 `preference:` 的原始值（小写、去引号）。
pub fn parse_block_preference(text: &str, block_key: &str) -> Option<String> {
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
                if v.is_empty() {
                    return None;
                }
                return Some(v);
            }
        }
    }
    None
}

/// 写入或补全某 yaml 块的 `preference:`；尽量保留其它键与格式。
pub fn upsert_block_preference(text: &str, block_key: &str, pref: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_and_upsert_locale_block() {
        let y = "locale:\n  preference: zh\n";
        assert_eq!(
            parse_block_preference(y, "locale:").as_deref(),
            Some("zh")
        );
        let n = upsert_block_preference(y, "locale:", "en");
        assert!(n.contains("preference: en"));
        assert!(!n.contains("preference: zh"));
    }
}
