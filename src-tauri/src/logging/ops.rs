//! 用户操作审计：内存 ring + settings diff（脱敏）。

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::settings::{RuntimeSettings, UiSettings};

const OPS_CAPACITY: usize = 200;
const RING_DEDUPE_MS: u64 = 50;

static SPAWN_GEN: AtomicU64 = AtomicU64::new(0);

struct OpsRing {
    lines: VecDeque<String>,
    last_line: String,
    last_at: Instant,
}

static OPS_RING: LazyLock<Mutex<OpsRing>> = LazyLock::new(|| {
    Mutex::new(OpsRing {
        lines: VecDeque::with_capacity(OPS_CAPACITY),
        last_line: String::new(),
        last_at: Instant::now() - Duration::from_secs(3600),
    })
});

#[derive(Default)]
pub struct DiagnosticsContext {
    pub session_id: Mutex<Option<String>>,
    pub app_state: Mutex<Option<serde_json::Value>>,
    pub inject_errors: Mutex<Vec<String>>,
}

impl DiagnosticsContext {
    pub fn new() -> Self {
        Self::default()
    }
}

fn push_ring(line: &str) {
    let mut guard = OPS_RING.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if guard.last_line == line
        && now.duration_since(guard.last_at) < Duration::from_millis(RING_DEDUPE_MS)
    {
        return;
    }
    guard.last_line = line.to_string();
    guard.last_at = now;
    if guard.lines.len() >= OPS_CAPACITY {
        guard.lines.pop_front();
    }
    guard.lines.push_back(line.to_string());
}

fn sanitize_ops_fragment(raw: &str, max_len: usize) -> String {
    raw.replace('\n', " ")
        .replace('\r', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_len)
        .collect()
}

/// IPC 边界 ops：成功/失败 + 可选 op_id（与 UI shellLog 配对）。
pub fn record_op_outcome(action: &str, outcome: &str, op_id: Option<&str>, extra: &str) {
    let op_part = op_id
        .map(|id| format!(" op_id={id}"))
        .unwrap_or_default();
    let extra_part = if extra.is_empty() {
        String::new()
    } else {
        format!(" {extra}")
    };
    record_op(&format!(
        "action={action} outcome={outcome}{extra_part}{op_part}"
    ));
}

/// 失败 ops：reason 截断脱换行。
pub fn record_op_err(action: &str, op_id: Option<&str>, reason: &str) {
    let reason = sanitize_ops_fragment(reason, 120);
    record_op_outcome(action, "err", op_id, &format!("reason={reason}"));
}

/// 记 ops 行：落盘 + ring。
pub fn record_op(line: &str) {
    log::info!(target: "shell::ops", "{line}");
    push_ring(line);
}

pub fn next_spawn_gen() -> u64 {
    SPAWN_GEN.fetch_add(1, Ordering::Relaxed) + 1
}

pub fn current_spawn_gen() -> u64 {
    SPAWN_GEN.load(Ordering::Relaxed)
}

pub fn ops_snapshot_jsonl() -> String {
    let guard = OPS_RING.lock().unwrap_or_else(|e| e.into_inner());
    guard.lines.iter().cloned().collect::<Vec<_>>().join("\n")
}

fn redact_proxy_url(url: &str) -> String {
    if url.trim().is_empty() {
        String::new()
    } else {
        "<redacted>".into()
    }
}

fn field_str<T: Serialize>(v: &T) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "?".into())
}

/// 运行时设置 diff（仅变更字段；proxy_url 脱敏）。
pub fn log_runtime_settings_diff(old: &RuntimeSettings, new: &RuntimeSettings) {
    let mut changes: Vec<String> = Vec::new();
    if old.mirror != new.mirror {
        changes.push(format!(
            "mirror={}→{}",
            field_str(&old.mirror),
            field_str(&new.mirror)
        ));
    }
    if old.proxy_mode != new.proxy_mode {
        changes.push(format!(
            "proxy_mode={}→{}",
            field_str(&old.proxy_mode),
            field_str(&new.proxy_mode)
        ));
    }
    if old.proxy_url != new.proxy_url {
        changes.push(format!(
            "proxy_url={}→{}",
            redact_proxy_url(&old.proxy_url),
            redact_proxy_url(&new.proxy_url)
        ));
    }
    if old.dsh_home_override != new.dsh_home_override {
        changes.push(format!(
            "dsh_home_override={}→{}",
            basename_or_dash(&old.dsh_home_override),
            basename_or_dash(&new.dsh_home_override)
        ));
    }
    if old.close_to_tray != new.close_to_tray {
        changes.push(format!("close_to_tray={}→{}", old.close_to_tray, new.close_to_tray));
    }
    if old.close_pref_set != new.close_pref_set {
        changes.push(format!("close_pref_set={}→{}", old.close_pref_set, new.close_pref_set));
    }
    if old.preferred_port != new.preferred_port {
        changes.push(format!(
            "preferred_port={}→{}",
            old.preferred_port, new.preferred_port
        ));
    }
    if old.cli_link_enabled != new.cli_link_enabled {
        changes.push(format!(
            "cli_link_enabled={}→{}",
            old.cli_link_enabled, new.cli_link_enabled
        ));
    }
    if old.runtime_source != new.runtime_source {
        changes.push(format!(
            "runtime_source={}→{}",
            field_str(&old.runtime_source),
            field_str(&new.runtime_source)
        ));
    }
    if old.onboarding_done != new.onboarding_done {
        changes.push(format!(
            "onboarding_done={}→{}",
            old.onboarding_done, new.onboarding_done
        ));
    }
    if changes.is_empty() {
        return;
    }
    record_op(&format!(
        "action=settings.runtime.save outcome=ok {}",
        changes.join(" ")
    ));
}

pub fn log_ui_settings_diff(old: &UiSettings, new: &UiSettings) {
    let mut changes: Vec<String> = Vec::new();
    if old.titlebar_compact != new.titlebar_compact {
        changes.push(format!(
            "titlebar_compact={}→{}",
            old.titlebar_compact, new.titlebar_compact
        ));
    }
    if old.selection_hygiene != new.selection_hygiene {
        changes.push(format!(
            "selection_hygiene={}→{}",
            old.selection_hygiene, new.selection_hygiene
        ));
    }
    if old.session_log_in_titlebar != new.session_log_in_titlebar {
        changes.push(format!(
            "session_log_in_titlebar={}→{}",
            old.session_log_in_titlebar, new.session_log_in_titlebar
        ));
    }
    if changes.is_empty() {
        return;
    }
    record_op(&format!(
        "action=settings.ui.save outcome=ok {}",
        changes.join(" ")
    ));
}

fn basename_or_dash(path: &str) -> String {
    let t = path.trim();
    if t.is_empty() {
        return "-".into();
    }
    std::path::Path::new(t)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("-")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{MirrorKind, ProxyMode};

    #[test]
    fn ring_dedupes_identical_line_within_50ms() {
        record_op("action=test.dedupe outcome=ok");
        let after_first = ops_snapshot_jsonl();
        assert_eq!(after_first.matches("test.dedupe").count(), 1);
        record_op("action=test.dedupe outcome=ok");
        let after_second = ops_snapshot_jsonl();
        assert_eq!(after_second.matches("test.dedupe").count(), 1);
    }

    #[test]
    fn runtime_diff_logs_mirror_change() {
        let old = RuntimeSettings {
            mirror: MirrorKind::Domestic,
            proxy_mode: ProxyMode::Off,
            proxy_url: String::new(),
            dsh_home_override: String::new(),
            close_to_tray: true,
            close_pref_set: false,
            close_pref_touched: false,
            preferred_port: 0,
            cli_link_enabled: false,
            runtime_source: crate::system_runtime::RuntimeSource::Auto,
            onboarding_done: false,
            path_meta: None,
        };
        let mut new = old.clone();
        new.mirror = MirrorKind::Official;
        log_runtime_settings_diff(&old, &new);
        let snap = ops_snapshot_jsonl();
        assert!(snap.contains("mirror="));
        assert!(snap.contains("settings.runtime.save"));
    }
}
