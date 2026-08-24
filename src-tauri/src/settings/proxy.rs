//! 代理解析与子进程环境注入。

use std::collections::HashMap;
use std::process::Command;

use super::types::ShellSettings;

/// loopback 探活与子进程 dsh 须绕过系统代理。
pub const LOOPBACK_NO_PROXY: &str = "127.0.0.1,localhost";

/// 读 Windows「Internet 设置」系统代理；失败则返回 None（调用方当直连）。
pub(crate) fn read_windows_system_proxy() -> Option<String> {
    #[cfg(windows)]
    {
        let output = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v",
                "ProxyEnable",
            ])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        if !text.contains("0x1") {
            return None;
        }
        let output = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v",
                "ProxyServer",
            ])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if !line.contains("ProxyServer") {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }
            let raw = parts[parts.len() - 1];
            return normalize_proxy_server(raw);
        }
        None
    }
    #[cfg(not(windows))]
    {
        None
    }
}

pub(crate) fn normalize_proxy_server(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if raw.contains('=') {
        for part in raw.split(';') {
            let part = part.trim();
            if let Some(rest) = part.strip_prefix("http=") {
                return Some(ensure_http_scheme(rest));
            }
            if let Some(rest) = part.strip_prefix("https=") {
                return Some(ensure_http_scheme(rest));
            }
        }
    }
    Some(ensure_http_scheme(raw))
}

fn ensure_http_scheme(host_port: &str) -> String {
    if host_port.contains("://") {
        host_port.to_string()
    } else {
        format!("http://{host_port}")
    }
}

/// 给 Command 注入代理相关环境变量（大小写都写，兼容 Node/npm）。
#[allow(dead_code)]
pub fn apply_proxy_env(cmd: &mut Command, settings: &ShellSettings) {
    match settings.resolved_proxy_url() {
        Some(url) => {
            for key in [
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "ALL_PROXY",
                "http_proxy",
                "https_proxy",
                "all_proxy",
            ] {
                cmd.env(key, &url);
            }
            cmd.env("NO_PROXY", LOOPBACK_NO_PROXY);
            cmd.env("no_proxy", LOOPBACK_NO_PROXY);
        }
        None => {
            for key in [
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "ALL_PROXY",
                "http_proxy",
                "https_proxy",
                "all_proxy",
            ] {
                cmd.env_remove(key);
            }
        }
    }
}

/// 供 CreateProcess 环境块：覆盖或清除代理键（合并进完整 env 时用）。
pub fn proxy_env_overrides(settings: &ShellSettings) -> HashMap<String, String> {
    let mut map = HashMap::new();
    match settings.resolved_proxy_url() {
        Some(url) => {
            for key in [
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "ALL_PROXY",
                "http_proxy",
                "https_proxy",
                "all_proxy",
            ] {
                map.insert(key.to_string(), url.clone());
            }
            map.insert("NO_PROXY".into(), LOOPBACK_NO_PROXY.into());
            map.insert("no_proxy".into(), LOOPBACK_NO_PROXY.into());
        }
        None => {
            for key in [
                "HTTP_PROXY",
                "HTTPS_PROXY",
                "ALL_PROXY",
                "http_proxy",
                "https_proxy",
                "all_proxy",
            ] {
                map.insert(key.to_string(), String::new());
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::types::ProxyMode;
    use crate::settings::ShellSettings;

    #[test]
    fn normalize_proxy_server_cases() {
        assert_eq!(
            normalize_proxy_server("127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
        assert_eq!(
            normalize_proxy_server("http://127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
        assert_eq!(
            normalize_proxy_server("http=127.0.0.1:7890;https=127.0.0.1:7890").as_deref(),
            Some("http://127.0.0.1:7890")
        );
        assert_eq!(normalize_proxy_server("").as_deref(), None);
    }

    #[test]
    fn custom_proxy_empty_resolves_none() {
        let s = ShellSettings {
            proxy_mode: ProxyMode::Custom,
            proxy_url: "  ".into(),
            ..Default::default()
        };
        assert!(s.resolved_proxy_url().is_none());
    }

    #[test]
    fn proxy_env_overrides_with_proxy_sets_loopback_no_proxy() {
        let s = ShellSettings {
            proxy_mode: ProxyMode::Custom,
            proxy_url: "http://127.0.0.1:7890".into(),
            ..Default::default()
        };
        let map = proxy_env_overrides(&s);
        assert_eq!(map.get("NO_PROXY").map(String::as_str), Some(LOOPBACK_NO_PROXY));
        assert_eq!(map.get("no_proxy").map(String::as_str), Some(LOOPBACK_NO_PROXY));
        assert_eq!(
            map.get("HTTP_PROXY").map(String::as_str),
            Some("http://127.0.0.1:7890")
        );
    }

    #[test]
    fn proxy_env_overrides_without_proxy_clears_keys() {
        let s = ShellSettings {
            proxy_mode: ProxyMode::Off,
            ..Default::default()
        };
        let map = proxy_env_overrides(&s);
        assert_eq!(map.get("HTTP_PROXY").map(String::as_str), Some(""));
        assert!(!map.contains_key("NO_PROXY"));
        assert!(!map.contains_key("no_proxy"));
    }

    #[test]
    fn apply_proxy_env_with_proxy_sets_loopback_no_proxy() {
        let mut cmd = Command::new("echo");
        let s = ShellSettings {
            proxy_mode: ProxyMode::Custom,
            proxy_url: "http://127.0.0.1:7890".into(),
            ..Default::default()
        };
        apply_proxy_env(&mut cmd, &s);
        let no_proxy = cmd
            .get_envs()
            .find(|(k, _)| *k == "NO_PROXY")
            .and_then(|(_, v)| v.map(|v| v.to_string_lossy().to_string()));
        assert_eq!(no_proxy.as_deref(), Some(LOOPBACK_NO_PROXY));
        let http_proxy = cmd
            .get_envs()
            .find(|(k, _)| *k == "HTTP_PROXY")
            .and_then(|(_, v)| v.map(|v| v.to_string_lossy().to_string()));
        assert_eq!(http_proxy.as_deref(), Some("http://127.0.0.1:7890"));
    }

    #[test]
    fn apply_proxy_env_without_proxy_removes_keys() {
        let mut cmd = Command::new("echo");
        cmd.env("HTTP_PROXY", "http://old");
        let s = ShellSettings {
            proxy_mode: ProxyMode::Off,
            ..Default::default()
        };
        apply_proxy_env(&mut cmd, &s);
        let removed = cmd
            .get_envs()
            .find(|(k, v)| *k == "HTTP_PROXY" && v.is_none());
        assert!(removed.is_some());
    }
}
