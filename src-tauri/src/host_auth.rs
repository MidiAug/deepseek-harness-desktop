//! 上游 0.1.2+ 浏览器 Host 认证：从 harness 日志解析启动令牌 URL。
//!
//! 契约：`dsh web: http://127.0.0.1:{port}/?token={launchToken}`（可附带 LAN 段）。
//! 无 `?token=` 时视为旧版（如 0.1.1-rc.2），调用方继续用裸根 URL。

/// 从 harness.log（或 spawn 尾）解析最近一次带 token 的 loopback 根 URL。
pub fn parse_authenticated_url_from_log(text: &str) -> Option<String> {
    for line in text.lines().rev() {
        let s = normalize_log_line(line);
        let Some(idx) = s.find("dsh web: ") else {
            continue;
        };
        let after = &s[idx + "dsh web: ".len()..];
        let url_part = after.split_whitespace().next()?;
        if !url_has_launch_token(url_part) {
            continue;
        }
        if !(url_part.starts_with("http://127.0.0.1:")
            || url_part.starts_with("http://localhost:"))
        {
            continue;
        }
        return Some(url_part.to_string());
    }
    None
}

/// URL 是否携带启动令牌 query（`token`）。
pub fn url_has_launch_token(url: &str) -> bool {
    url.contains("?token=") || url.contains("&token=")
}

fn normalize_log_line(line: &str) -> String {
    let mut s = line.trim();
    for prefix in ["[err]", "[out]", "[INFO]", "[WARN]"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            s = rest.trim();
        }
    }
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_token_url_from_out_line() {
        let log = r#"
--- spawn gen=1 (Hosted) dsh web --host 127.0.0.1 --port 3081 ---
[out] listening
[out] dsh web: http://127.0.0.1:3081/?token=abcXYZ123 (LAN: http://192.168.1.2:3081/?token=abcXYZ123)
"#;
        assert_eq!(
            parse_authenticated_url_from_log(log).as_deref(),
            Some("http://127.0.0.1:3081/?token=abcXYZ123")
        );
    }

    #[test]
    fn ignores_legacy_url_without_token() {
        let log = "[out] dsh web: http://127.0.0.1:3081\n";
        assert!(parse_authenticated_url_from_log(log).is_none());
    }

    #[test]
    fn prefers_latest_spawn_tail() {
        let log = r#"
[out] dsh web: http://127.0.0.1:3080/?token=old
--- spawn gen=2 ---
[out] dsh web: http://127.0.0.1:3082/?token=new
"#;
        // 无 spawn 过滤时仍取文末匹配；supervise 侧会先 tail_since_last_spawn
        assert_eq!(
            parse_authenticated_url_from_log(log).as_deref(),
            Some("http://127.0.0.1:3082/?token=new")
        );
    }

    #[test]
    fn url_has_launch_token_detects_query() {
        assert!(url_has_launch_token("http://127.0.0.1:1/?token=x"));
        assert!(url_has_launch_token("http://127.0.0.1:1/?t=1&token=x"));
        assert!(!url_has_launch_token("http://127.0.0.1:1/"));
        assert!(!url_has_launch_token("http://127.0.0.1:1/?t=1"));
    }

    /// 对抗：仅 LAN 行、无 loopback → 不得当作壳探活 URL。
    #[test]
    fn ignores_lan_only_token_url() {
        let log = "[out] dsh web: http://192.168.1.2:3081/?token=abc\n";
        assert!(parse_authenticated_url_from_log(log).is_none());
    }
}
