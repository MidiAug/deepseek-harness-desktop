//! 宿主日志：目录解析 + 高频行限流。

mod harness_detail;
mod ops;
mod rate_limit;

pub use harness_detail::{extract_plugin_root_cause, tail_since_last_spawn, tail_text};
pub use ops::{
    current_spawn_gen, log_runtime_settings_diff, log_ui_settings_diff, next_spawn_gen,
    ops_snapshot_jsonl, record_op, DiagnosticsContext,
};

use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

pub use rate_limit::{is_important_stream_line, is_noisy_stream_line, RateGate};

/// `com.deepseek.harness.desktop` 与 tauri.conf identifier 对齐。
const BUNDLE_ID: &str = "com.deepseek.harness.desktop";

static NPM_LOG_GATE: LazyLock<RateGate> = LazyLock::new(|| RateGate::new(Duration::from_millis(500)));
static HARNESS_TEE_GATE: LazyLock<RateGate> = LazyLock::new(|| RateGate::new(Duration::from_millis(250)));
static HARNESS_TEE_SUMMARY: LazyLock<RateGate> = LazyLock::new(|| RateGate::new(Duration::from_secs(3)));
/// 下载字节进度：UI 仍逐 chunk 刷新，shell.log / dev 终端最多 2s 一条。
static DOWNLOAD_BYTE_GATE: LazyLock<RateGate> =
    LazyLock::new(|| RateGate::new(Duration::from_secs(2)));
/// npm install 心跳（秒数在变）：按间隔采样，避免「已 Ns」刷屏。
static NPM_HEARTBEAT_GATE: LazyLock<RateGate> =
    LazyLock::new(|| RateGate::new(Duration::from_secs(5)));
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

fn is_download_byte_progress(message: &str) -> bool {
    message.starts_with("下载中 ") && message.contains("字节")
}

fn is_npm_install_heartbeat(message: &str) -> bool {
    message.starts_with("npm install 进行中")
        || message.starts_with("npm 全局安装进行中")
}

/// 相同 stage+message 在 2s 内只记一次 shell.log（「等待官方 UI」等心跳）。
pub fn should_log_progress_line(stage: &str, message: &str) -> bool {
    if is_important_stream_line(message) {
        return true;
    }
    if is_download_byte_progress(message) {
        return DOWNLOAD_BYTE_GATE.allow(false);
    }
    if is_npm_install_heartbeat(message) {
        return NPM_HEARTBEAT_GATE.allow(false);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_byte_progress_throttled() {
        let msg = "下载中 15228036/35556852 字节";
        assert!(is_download_byte_progress(msg));
        assert!(should_log_progress_line("download-node", msg));
        assert!(!should_log_progress_line("download-node", msg));
    }

    #[test]
    fn npm_heartbeat_throttled() {
        let a = "npm install 进行中（已 51s，通常需数分钟）…";
        let b = "npm install 进行中（已 52s，通常需数分钟）…";
        assert!(should_log_progress_line("install-dsh", a));
        assert!(!should_log_progress_line("install-dsh", b));
    }

    #[test]
    fn identical_progress_deduped_within_2s() {
        let msg = "等待官方 UI 监听 http://127.0.0.1:3081…";
        assert!(should_log_progress_line("start", msg));
        assert!(!should_log_progress_line("start", msg));
    }
}
