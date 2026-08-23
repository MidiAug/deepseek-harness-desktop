//! 日志限流：高频子进程/npm 行采样，避免 dev 终端与 shell.log 被刷屏。

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 固定间隔闸门（线程安全）。
pub struct RateGate {
    interval: Duration,
    state: Mutex<GateState>,
}

struct GateState {
    last_emit: Option<Instant>,
    suppressed: u32,
}

impl RateGate {
    pub fn new(interval: Duration) -> Self {
        Self {
            interval,
            state: Mutex::new(GateState {
                last_emit: None,
                suppressed: 0,
            }),
        }
    }

    /// 是否允许本次输出；`force` 为 true 时跳过节流但仍累计 suppressed 统计。
    pub fn allow(&self, force: bool) -> bool {
        let mut st = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if force {
            st.suppressed = 0;
            st.last_emit = Some(Instant::now());
            return true;
        }
        let now = Instant::now();
        if let Some(last) = st.last_emit {
            if now.duration_since(last) < self.interval {
                st.suppressed = st.suppressed.saturating_add(1);
                return false;
            }
        }
        st.last_emit = Some(now);
        st.suppressed = 0;
        true
    }

    /// 取回被抑制的条数并清零（用于周期性摘要）。
    pub fn take_suppressed(&self) -> u32 {
        let mut st = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let n = st.suppressed;
        st.suppressed = 0;
        n
    }
}

/// npm / 进度条等噪声行：仍写 harness.log，但可跳过宿主日志。
pub fn is_noisy_stream_line(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return true;
    }
    if t.starts_with("...") || t.starts_with('…') {
        return true;
    }
    // npm 进度条、大量点号
    if t.len() < 120 && (t.contains('█') || t.contains('▕') || t.matches('.').count() > 12) {
        return true;
    }
    false
}

/// 错误/警告类行始终透出。
pub fn is_important_stream_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    [
        "error",
        "err!",
        "warn",
        "fail",
        "fatal",
        "exception",
        "npm err",
        "econn",
        "timeout",
        "denied",
    ]
    .iter()
    .any(|k| lower.contains(k))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate_blocks_burst() {
        let gate = RateGate::new(Duration::from_millis(100));
        assert!(gate.allow(false));
        assert!(!gate.allow(false));
        assert_eq!(gate.take_suppressed(), 1);
    }

    #[test]
    fn important_not_noisy() {
        assert!(is_important_stream_line("npm ERR! code ENOENT"));
        assert!(!is_noisy_stream_line("npm ERR! code ENOENT"));
    }
}
