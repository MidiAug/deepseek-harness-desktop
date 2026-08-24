//! 监视 `DSH_HOME/settings.yaml`（非递归）：主题与语言变更分别 emit。

use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Runtime};

use crate::dsh_locale;
use crate::dsh_settings;
use crate::dsh_theme;

fn settings_yaml_hit(paths: &[std::path::PathBuf]) -> bool {
    if paths.is_empty() {
        return true;
    }
    paths.iter().any(|p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n == "settings.yaml" || n.starts_with("settings.yaml"))
            .unwrap_or(false)
    })
}

fn read_prefs(home: &Path) -> (String, Option<String>) {
    (
        dsh_theme::preference_from_home(home),
        dsh_locale::explicit_preference_from_home(home).map(str::to_string),
    )
}

fn read_prefs_settled(home: &Path) -> (String, Option<String>) {
    let first = read_prefs(home);
    std::thread::sleep(Duration::from_millis(100));
    let second = read_prefs(home);
    if second != first {
        std::thread::sleep(Duration::from_millis(80));
        return read_prefs(home);
    }
    second
}

pub fn spawn_watch<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::Builder::new()
        .name("dsh-settings-watch".into())
        .spawn(move || {
            let home = dsh_settings::dsh_home_for_app(&app);
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
                    log::warn!(target: "shell::watch", "dsh settings watch: {e}");
                    return;
                }
            };
            if let Err(e) = watcher.watch(&home, RecursiveMode::NonRecursive) {
                log::warn!(target: "shell::watch", "dsh settings watch dir: {e}");
                return;
            }
            let (mut last_theme, mut last_locale) = read_prefs_settled(&home);
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
                if !settings_yaml_hit(&event.paths) {
                    continue;
                }
                std::thread::sleep(Duration::from_millis(80));
                let (theme, locale) = read_prefs_settled(&home);
                let theme_changed = theme != last_theme;
                let locale_changed = locale != last_locale;
                if !theme_changed && !locale_changed {
                    if last_emit.elapsed() < Duration::from_millis(200) {
                        continue;
                    }
                    continue;
                }
                last_emit = Instant::now();
                if theme_changed {
                    last_theme = theme.clone();
                    let _ = app.emit(dsh_theme::CHANGED_EVENT, theme);
                }
                if locale_changed {
                    last_locale = locale.clone();
                    if let Some(ref pref) = locale {
                        let _ = app.emit(dsh_locale::CHANGED_EVENT, pref.clone());
                    }
                }
            }
            let _ = watcher;
        })
        .ok();
}
