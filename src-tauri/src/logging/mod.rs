//! 宿主日志：目录解析 + 高频行限流。

mod harness_detail;
mod rate_limit;

pub use harness_detail::{extract_plugin_root_cause, tail_since_last_spawn, tail_text};

use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

pub use rate_limit::{is_important_stream_line, is_noisy_stream_line, RateGate};

/// `com.deepseek.harness.desktop` 与 tauri.conf identifier 对齐。
const BUNDLE_ID: &str = "com.deepseek.harness.desktop";

static NPM_LOG_GATE: LazyLock<RateGate> = LazyLock::new(|| RateGate::new(Duration::from_millis(500)));
static HARNESS_TEE_GATE: LazyLock<RateGate> = LazyLock::new(|| RateGate::new(Duration::from_millis(250)));
static HARNESS_TEE_SUMMARY: LazyLock<RateGate> = LazyLock::new(|| RateGate::new(Duration::from_secs(3)));
static PROGRESS_LAST: LazyLock<Mutex<(String, Instant)>> =
    LazyLock::new(|| Mutex::new((String::new(), Instant::now())));

/// `%LocalAppData%/{bundle}/logs`，与 Tauri `app_data_dir` + `logs` 一致。
pub fn host_log_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(BUNDLE_ID)
        .join("logs")
}

/// npm 流式行写入 shell.log 前限流（UI 事件不受此影响）。
pub fn should_log_npm_line(line: &str) -> bool {
    if is_important_stream_line(line) {
        return true;
    }
    if is_noisy_stream_line(line) {
        return false;
    }
    NPM_LOG_GATE.allow(false)
}

/// 相同 stage+message 在 2s 内只记一次 shell.log（「等待官方 UI」等心跳）。
pub fn should_log_progress_line(stage: &str, message: &str) -> bool {
    if is_important_stream_line(message) {
        return true;
    }
    let key = format!("{stage}|{message}");
    let mut guard = PROGRESS_LAST.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if guard.0 == key && now.duration_since(guard.1) < Duration::from_secs(2) {
        return false;
    }
    guard.0 = key;
    guard.1 = now;
    true
}

/// dev 终端回显 harness 行；文件侧仍完整写入 harness.log。
pub fn tee_harness_line_to_host(is_stderr: bool, line: &str) {
    let important = is_important_stream_line(line);
    if important || HARNESS_TEE_GATE.allow(false) {
        if is_stderr {
            log::warn!(target: "harness::err", "{line}");
        } else if important || !is_noisy_stream_line(line) {
            log::info!(target: "harness::out", "{line}");
        }
    }
    if HARNESS_TEE_SUMMARY.allow(false) {
        let n = HARNESS_TEE_GATE.take_suppressed();
        if n > 0 {
            log::info!(
                target: "harness::out",
                "… ({n} more harness lines suppressed, see harness.log)"
            );
        }
    }
}
