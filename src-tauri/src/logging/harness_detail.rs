//! 从 harness.log 尾部提取插件失败的可操作根因，供 Boot 失败页展示。

const TAIL_CHARS: usize = 4000;

/// 读取日志尾部（与 supervise 探针窗口一致）。
pub fn tail_text(full: &str) -> &str {
    if full.len() <= TAIL_CHARS {
        full
    } else {
        &full[full.len() - TAIL_CHARS..]
    }
}

const SPAWN_MARKER: &str = "--- spawn";

/// 仅取最近一次 spawn 之后的日志，避免 reset 后仍读到上一轮插件错误。
pub fn tail_since_last_spawn(full: &str) -> &str {
    if let Some(idx) = full.rfind(SPAWN_MARKER) {
        &full[idx..]
    } else {
        tail_text(full)
    }
}

fn normalize_harness_log_line(line: &str) -> String {
    let mut s = line.trim();
    for prefix in ["[err]", "[out]", "[INFO]", "[WARN]"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest.trim();
        }
    }
    while let Some(rest) = s.strip_prefix("[cause]:") {
        s = rest.trim();
    }
    s.to_string()
}

fn is_harness_stack_noise(line: &str) -> bool {
    let l = line.trim();
    l.contains(" at ")
        || l.starts_with("file:///")
        || l.starts_with("at ")
        || l.contains("process.processTicksAndRejections")
        || l.contains("updateError (")
}

fn score_plugin_detail_line(line: &str) -> i32 {
    let lower = line.to_lowercase();
    if lower.contains("credentials-local:") {
        return 100;
    }
    if lower.contains("dshmarket") {
        return 80;
    }
    if lower.starts_with("typeerror:")
        && (lower.contains("credentials") || lower.contains("plugin"))
    {
        return 70;
    }
    if lower.contains("plugin tree failed") {
        return 50;
    }
    if lower.contains("failed to apply loader") {
        return 30;
    }
    0
}

fn extract_actionable_plugin_message(line: &str) -> String {
    let line = line.trim();
    let lower = line.to_lowercase();
    if let Some(idx) = lower.find("credentials-local:") {
        return line[idx..].trim().to_string();
    }
    if let Some(idx) = line.find("TypeError:") {
        let rest = line[idx + "TypeError:".len()..].trim();
        let rest_lower = rest.to_lowercase();
        if let Some(cidx) = rest_lower.find("credentials-local:") {
            return rest[cidx..].trim().to_string();
        }
        return rest.to_string();
    }
    if line.contains("plugin tree failed") {
        return line.to_string();
    }
    line.to_string()
}

/// 从 harness.log 尾部提取最可操作的插件根因行（纯函数，便于单测）。
pub fn extract_plugin_root_cause(tail: &str) -> Option<String> {
    let mut best: Option<(i32, String)> = None;
    for line in tail.lines().rev() {
        let norm = normalize_harness_log_line(line);
        if norm.is_empty() || is_harness_stack_noise(&norm) {
            continue;
        }
        let score = score_plugin_detail_line(&norm);
        if score == 0 {
            continue;
        }
        let msg = extract_actionable_plugin_message(&norm);
        if msg.is_empty() {
            continue;
        }
        let replace = best.as_ref().map_or(true, |(s, _)| score >= *s);
        if replace {
            best = Some((score, msg));
        }
        if score >= 100 {
            break;
        }
    }
    best.map(|(_, m)| m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_credentials_version_from_cause_chain() {
        let tail = r#"[err] Error: dsh: plugin tree failed to load: ... credentials-local: the value for "version" in C:\Users\22346\.dsh\.credentials.yaml must be a string
[err] TypeError: credentials-local: the value for "version" in C:\Users\22346\.dsh\.credentials.yaml must be a string
[err]   [cause]: Error: failed to apply loader entry include (cordis:include): ...
[err]       [cause]: TypeError: credentials-local: the value for "version" in C:\Users\22346\.dsh\.credentials.yaml must be a string
"#;
        let detail = extract_plugin_root_cause(tail).expect("detail");
        assert!(detail.starts_with("credentials-local:"));
        assert!(detail.contains("must be a string"));
        assert!(detail.contains(".credentials.yaml"));
    }

    #[test]
    fn skips_stack_frames() {
        let tail = r#"[err]     at parseCredentialsDocument (file:///C:/npm/dsh-credentials-local/lib/index.js:132:40)
[err]       [cause]: TypeError: credentials-local: invalid profile
"#;
        let detail = extract_plugin_root_cause(tail).expect("detail");
        assert_eq!(detail, "credentials-local: invalid profile");
    }

    #[test]
    fn returns_none_without_plugin_signal() {
        let tail = "[err] listening on 127.0.0.1:3081\n[out] boot complete\n";
        assert!(extract_plugin_root_cause(tail).is_none());
    }

    #[test]
    fn tail_since_last_spawn_ignores_prior_session() {
        let full = r#"[err] credentials-local: stale error from prior boot
--- spawn (Hosted) dsh web --host 127.0.0.1 --port 3081 ---
[out] dsh web: http://127.0.0.1:3081
"#;
        let tail = tail_since_last_spawn(full);
        assert!(!tail.contains("stale error"));
        assert!(tail.contains("dsh web:"));
        assert!(extract_plugin_root_cause(tail).is_none());
    }
}
