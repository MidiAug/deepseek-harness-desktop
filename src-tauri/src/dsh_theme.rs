//! DSH 主题真源：`DSH_HOME/settings.yaml` → `ui-theme.preference`（light|dark|system）。
//! 壳与官方 UI 共用；写回同一字段；目录 watch 推送变更（无轮询）。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Runtime};

use crate::paths;
use crate::settings;

pub const CHANGED_EVENT: &str = "dsh-theme-changed";

/// 返回 `light` | `dark` | `system`。
pub fn preference_for_app<R: Runtime>(app: &AppHandle<R>) -> String {
    preference_from_home(&dsh_home_for(app))
}

pub fn set_preference_for_app<R: Runtime>(
    app: &AppHandle<R>,
    preference: &str,
) -> Result<(), String> {
    let pref = normalize_pref(preference)?;
    set_preference_in_home(&dsh_home_for(app), pref)?;
    // 立刻通知前端（不等 watch）
    let _ = app.emit(CHANGED_EVENT, pref);
    Ok(())
}

fn dsh_home_for<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    let cfg = settings::load(app);
    paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()))
}

pub fn preference_from_home(dsh_home: &Path) -> String {
    let path = dsh_home.join("settings.yaml");
    let Ok(text) = fs::read_to_string(&path) else {
        return "system".into();
    };
    parse_ui_theme_preference(&text)
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
    fs::create_dir_all(dsh_home).map_err(|e| format!("mkdir DSH_HOME: {e}"))?;
    let path = dsh_home.join("settings.yaml");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let next = upsert_ui_theme_preference(&existing, pref);
    fs::write(&path, next).map_err(|e| format!("write settings.yaml: {e}"))?;
    Ok(())
}

pub fn upsert_ui_theme_preference(text: &str, pref: &str) -> String {
    let mut in_block = false;
    let mut replaced = false;
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let raw = line;
        let t = raw.trim();
        if t.starts_with("ui-theme:") {
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
        out.push("ui-theme:".into());
        out.push(format!("  preference: {pref}"));
    }
    let mut s = out.join("\n");
    if !s.ends_with('\n') {
        s.push('\n');
    }
    s
}

/// 仅识别 `ui-theme:` 块内的 `preference:`。
pub fn parse_ui_theme_preference(text: &str) -> Option<&'static str> {
    let mut in_block = false;
    for line in text.lines() {
        let raw = line;
        let t = raw.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if t.starts_with("ui-theme:") {
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
                    "light" => Some("light"),
                    "dark" => Some("dark"),
                    "system" => Some("system"),
                    "follow" => Some("system"),
                    _ => None,
                };
            }
        }
    }
    None
}

/// 监视 DSH_HOME（非递归）：settings.yaml 变更即 emit（防抖）。
pub fn spawn_watch<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::Builder::new()
        .name("dsh-theme-watch".into())
        .spawn(move || {
            let home = dsh_home_for(&app);
            let _ = fs::create_dir_all(&home);
            let (tx, rx) = mpsc::channel();
            let mut watcher = match RecommendedWatcher::new(
                move |res| {
                    let _ = tx.send(res);
                },
                notify::Config::default(),
            ) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("dsh theme watch: {e}");
                    return;
                }
            };
            if let Err(e) = watcher.watch(&home, RecursiveMode::NonRecursive) {
                eprintln!("dsh theme watch dir: {e}");
                return;
            }
            let mut last = preference_from_home(&home);
            let mut last_emit = Instant::now()
                .checked_sub(Duration::from_secs(1))
                .unwrap_or_else(Instant::now);
            for res in rx {
                let Ok(event) = res else { continue };
                if !matches!(
                    event.kind,
                    EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
                ) {
                    continue;
                }
                let hit = event.paths.iter().any(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n == "settings.yaml" || n.starts_with("settings.yaml"))
                        .unwrap_or(false)
                });
                if !hit && !event.paths.is_empty() {
                    continue;
                }
                // 短防抖：编辑器/原子替换常连发
                std::thread::sleep(Duration::from_millis(80));
                let pref = preference_from_home(&home);
                if pref == last && last_emit.elapsed() < Duration::from_millis(200) {
                    continue;
                }
                if pref == last {
                    continue;
                }
                last = pref.clone();
                last_emit = Instant::now();
                let _ = app.emit(CHANGED_EVENT, pref);
            }
            // keep watcher alive
            let _ = watcher;
        })
        .ok();
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
