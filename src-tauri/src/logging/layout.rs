//! 宿主日志目录布局：LocalAppData `logs/current` + `logs/archive`。
//!
//! 一次应用进程 = 一套 current；下次启动把 current 挪进 archive，不追加旧文件。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

/// `%LocalAppData%/{bundle}/logs`
pub fn host_log_dir() -> PathBuf {
    super::host_log_root()
}

pub fn current_log_dir() -> PathBuf {
    host_log_dir().join("current")
}

#[allow(dead_code)] // 文档/排障 API；打开日志用 host_log_root
pub fn archive_log_dir() -> PathBuf {
    host_log_dir().join("archive")
}

pub fn shell_log_path() -> PathBuf {
    current_log_dir().join("shell.log")
}

pub fn harness_log_path() -> PathBuf {
    current_log_dir().join("harness.log")
}

const SESSION_MARKER: &str = ".session";
const ARCHIVE_KEEP: usize = 15;

static PREPARED: OnceLock<PathBuf> = OnceLock::new();

/// 启动时调用一次：轮转旧 current → archive，创建空 current，返回 current 路径。
pub fn prepare_log_session() -> PathBuf {
    PREPARED
        .get_or_init(|| prepare_log_session_at(&host_log_dir(), ARCHIVE_KEEP))
        .clone()
}

/// 可测：在给定 logs 根上执行轮转。
pub fn prepare_log_session_at(root: &Path, keep: usize) -> PathBuf {
    let _ = fs::create_dir_all(root);
    let current = root.join("current");
    let archive = root.join("archive");
    let _ = fs::create_dir_all(&archive);

    // 弃用根目录下散落的旧 log（双写残留等），整包塞进 archive
    sweep_legacy_root(root, &archive);

    if current_has_content(&current) {
        let tag = read_session_tag(&current);
        let dest = unique_archive_dir(&archive, &tag);
        let _ = fs::rename(&current, &dest);
    } else if current.is_dir() {
        let _ = fs::remove_dir_all(&current);
    }

    let _ = fs::create_dir_all(&current);
    let session_id = new_session_id();
    let _ = fs::write(current.join(SESSION_MARKER), &session_id);

    prune_archives(&archive, keep);
    current
}

fn current_has_content(current: &Path) -> bool {
    if !current.is_dir() {
        return false;
    }
    let Ok(rd) = fs::read_dir(current) else {
        return false;
    };
    for e in rd.flatten() {
        let name = e.file_name();
        let name = name.to_string_lossy();
        if name == SESSION_MARKER {
            continue;
        }
        return true;
    }
    // 仅有 .session 也视为可轮转（空会话）
    current.join(SESSION_MARKER).is_file()
}

fn read_session_tag(current: &Path) -> String {
    fs::read_to_string(current.join(SESSION_MARKER))
        .ok()
        .map(|s| {
            let t = s.trim();
            if t.is_empty() {
                "unknown".into()
            } else {
                t.chars().take(8).collect()
            }
        })
        .unwrap_or_else(|| "unknown".into())
}

fn new_session_id() -> String {
    // 时间戳 + 简易随机，避免引 uuid 依赖
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let r = (ms ^ (ms >> 17)).wrapping_mul(0x9E37_79B9);
    format!("{ms:x}-{r:08x}")
}

fn stamp_local() -> String {
    // 本地墙钟近似：用 UTC 秒格式化为紧凑串；排障足够
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // YYYYMMDD-HHMMSS via simple UTC breakdown
    let days = secs / 86400;
    let tod = secs % 86400;
    let (y, m, d) = civil_from_days(days as i64);
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;
    format!("{y:04}{m:02}{d:02}-{hh:02}{mm:02}{ss:02}")
}

/// Howard Hinnant days_from_civil 逆变换（公历）。
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

fn unique_archive_dir(archive: &Path, tag: &str) -> PathBuf {
    let base = format!("{}_{tag}", stamp_local());
    let mut dest = archive.join(&base);
    if !dest.exists() {
        return dest;
    }
    for i in 2..100 {
        dest = archive.join(format!("{base}_{i}"));
        if !dest.exists() {
            return dest;
        }
    }
    archive.join(format!("{base}_{}", new_session_id()))
}

fn sweep_legacy_root(root: &Path, archive: &Path) {
    let Ok(rd) = fs::read_dir(root) else {
        return;
    };
    let mut leftovers = Vec::new();
    for e in rd.flatten() {
        let name = e.file_name();
        let name = name.to_string_lossy();
        if name == "current" || name == "archive" {
            continue;
        }
        leftovers.push(e.path());
    }
    if leftovers.is_empty() {
        return;
    }
    let dump = unique_archive_dir(archive, "legacy");
    let _ = fs::create_dir_all(&dump);
    for p in leftovers {
        if let Some(fname) = p.file_name() {
            let _ = fs::rename(&p, dump.join(fname));
        }
    }
}

fn prune_archives(archive: &Path, keep: usize) {
    let Ok(rd) = fs::read_dir(archive) else {
        return;
    };
    let mut dirs: Vec<_> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    if dirs.len() <= keep {
        return;
    }
    dirs.sort_by(|a, b| {
        let ma = fs::metadata(a).and_then(|m| m.modified()).ok();
        let mb = fs::metadata(b).and_then(|m| m.modified()).ok();
        ma.cmp(&mb) // 旧 → 新
    });
    let drop_n = dirs.len().saturating_sub(keep);
    for p in dirs.into_iter().take(drop_n) {
        let _ = fs::remove_dir_all(p);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn temp_root(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "dsh-log-layout-{}-{}-{}",
            name,
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn first_prepare_creates_empty_current_with_session() {
        let root = temp_root("first");
        let cur = prepare_log_session_at(&root, 15);
        assert_eq!(cur, root.join("current"));
        assert!(cur.join(SESSION_MARKER).is_file());
        assert!(!cur.join("shell.log").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn second_prepare_archives_previous_current() {
        let root = temp_root("rotate");
        let cur = prepare_log_session_at(&root, 15);
        fs::write(cur.join("shell.log"), "sess-a\n").unwrap();
        fs::write(cur.join("harness.log"), "h-a\n").unwrap();

        // 确保 mtime 可区分
        std::thread::sleep(Duration::from_millis(20));
        let cur2 = prepare_log_session_at(&root, 15);
        assert!(!cur2.join("shell.log").exists());
        assert!(cur2.join(SESSION_MARKER).is_file());

        let archives: Vec<_> = fs::read_dir(root.join("archive"))
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        assert_eq!(archives.len(), 1);
        assert!(archives[0].join("shell.log").is_file());
        assert!(archives[0].join("harness.log").is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn prune_keeps_only_n_archives() {
        let root = temp_root("prune");
        let archive = root.join("archive");
        fs::create_dir_all(&archive).unwrap();
        for i in 0..5 {
            let d = archive.join(format!("2026010{i}-000000_abcd"));
            fs::create_dir_all(&d).unwrap();
            fs::write(d.join("shell.log"), format!("{i}")).unwrap();
            std::thread::sleep(Duration::from_millis(15));
        }
        // 空 current 也走一遍 prepare
        let _ = prepare_log_session_at(&root, 2);
        let n = fs::read_dir(&archive)
            .unwrap()
            .flatten()
            .filter(|e| e.path().is_dir())
            .count();
        assert!(n <= 2, "expected <=2 archives, got {n}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn legacy_root_logs_swept_into_archive() {
        let root = temp_root("legacy");
        fs::write(root.join("shell.log"), "old\n").unwrap();
        fs::write(root.join("DeepSeek Harness Desktop.log"), "dup\n").unwrap();
        let _ = prepare_log_session_at(&root, 15);
        assert!(!root.join("shell.log").exists());
        assert!(!root.join("DeepSeek Harness Desktop.log").exists());
        let found = fs::read_dir(root.join("archive"))
            .unwrap()
            .flatten()
            .any(|e| {
                let p = e.path();
                p.is_dir()
                    && (p.join("shell.log").is_file()
                        || p.join("DeepSeek Harness Desktop.log").is_file())
            });
        assert!(found);
        let _ = fs::remove_dir_all(&root);
    }
}
