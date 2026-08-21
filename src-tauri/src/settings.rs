//! 壳设置：运行时（settings.json）与 UI chrome（ui.json）分文件持久化。
//! IPC 仍聚合为 [`ShellSettings`]，减少前端冲击。

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use crate::paths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum MirrorKind {
    /// npmmirror（Node + npm），国内默认
    #[default]
    Domestic,
    /// nodejs.org + registry.npmjs.org
    Official,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ProxyMode {
    #[default]
    Off,
    System,
    Custom,
}

/// 顶栏底色：黑（#1b1b1c）/ 灰（旧 panel）
/// `Transparent` 仅兼容旧 settings.json，load 时并入 Black
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum TitlebarStyle {
    #[default]
    Black,
    Gray,
    Transparent,
}

/// 运行时必需：镜像 / 代理 / DSH_HOME / 关闭行为
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
    pub mirror: MirrorKind,
    pub proxy_mode: ProxyMode,
    pub proxy_url: String,
    #[serde(default)]
    pub dsh_home_override: String,
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    #[serde(default)]
    pub close_pref_set: bool,
}

/// 纯壳 UI chrome
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    #[serde(default)]
    pub titlebar_style: TitlebarStyle,
    #[serde(default)]
    pub titlebar_compact: bool,
}

/// IPC / 前端聚合视图（camelCase）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSettings {
    pub mirror: MirrorKind,
    pub proxy_mode: ProxyMode,
    pub proxy_url: String,
    #[serde(default)]
    pub dsh_home_override: String,
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    #[serde(default)]
    pub close_pref_set: bool,
    #[serde(default)]
    pub titlebar_style: TitlebarStyle,
    #[serde(default)]
    pub titlebar_compact: bool,
}

fn default_true() -> bool {
    true
}

impl Default for RuntimeSettings {
    fn default() -> Self {
        Self {
            mirror: MirrorKind::Domestic,
            proxy_mode: ProxyMode::Off,
            proxy_url: String::new(),
            dsh_home_override: String::new(),
            close_to_tray: true,
            close_pref_set: false,
        }
    }
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            titlebar_style: TitlebarStyle::Black,
            titlebar_compact: false,
        }
    }
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self::from_parts(RuntimeSettings::default(), UiSettings::default())
    }
}

impl ShellSettings {
    pub fn from_parts(runtime: RuntimeSettings, ui: UiSettings) -> Self {
        Self {
            mirror: runtime.mirror,
            proxy_mode: runtime.proxy_mode,
            proxy_url: runtime.proxy_url,
            dsh_home_override: runtime.dsh_home_override,
            close_to_tray: runtime.close_to_tray,
            close_pref_set: runtime.close_pref_set,
            titlebar_style: ui.titlebar_style,
            titlebar_compact: ui.titlebar_compact,
        }
    }

    pub fn runtime(&self) -> RuntimeSettings {
        RuntimeSettings {
            mirror: self.mirror,
            proxy_mode: self.proxy_mode,
            proxy_url: self.proxy_url.clone(),
            dsh_home_override: self.dsh_home_override.clone(),
            close_to_tray: self.close_to_tray,
            close_pref_set: self.close_pref_set,
        }
    }

    pub fn ui(&self) -> UiSettings {
        UiSettings {
            titlebar_style: self.titlebar_style,
            titlebar_compact: self.titlebar_compact,
        }
    }
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(paths::base_dir(app)?.join("settings.json"))
}

fn ui_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(paths::base_dir(app)?.join("ui.json"))
}

fn write_json(path: &PathBuf, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir settings: {e}"))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

fn normalize_ui(mut ui: UiSettings) -> UiSettings {
    if ui.titlebar_style == TitlebarStyle::Transparent {
        ui.titlebar_style = TitlebarStyle::Black;
    }
    ui
}

/// 从旧单文件 Value 抽出 UI；有字段则返回 Some。
fn legacy_ui_from_value(v: &Value) -> Option<UiSettings> {
    let has_style = v.get("titlebarStyle").is_some();
    let has_compact = v.get("titlebarCompact").is_some();
    if !has_style && !has_compact {
        return None;
    }
    let mut ui = UiSettings::default();
    if let Some(s) = v.get("titlebarStyle") {
        if let Ok(style) = serde_json::from_value::<TitlebarStyle>(s.clone()) {
            ui.titlebar_style = style;
        }
    }
    if let Some(c) = v.get("titlebarCompact") {
        if let Some(b) = c.as_bool() {
            ui.titlebar_compact = b;
        }
    }
    Some(normalize_ui(ui))
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> ShellSettings {
    let Ok(settings_file) = settings_path(app) else {
        return ShellSettings::default();
    };
    let Ok(ui_file) = ui_path(app) else {
        return ShellSettings::default();
    };

    let mut runtime = RuntimeSettings::default();
    let mut ui = UiSettings::default();
    let mut need_migrate = false;
    let mut legacy_value: Option<Value> = None;

    if let Ok(text) = fs::read_to_string(&settings_file) {
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            legacy_value = Some(v.clone());
            if let Ok(r) = serde_json::from_value::<RuntimeSettings>(v.clone()) {
                runtime = r;
            }
        }
    }

    let ui_exists = ui_file.is_file();
    if ui_exists {
        if let Ok(text) = fs::read_to_string(&ui_file) {
            if let Ok(u) = serde_json::from_str::<UiSettings>(&text) {
                ui = normalize_ui(u);
            }
        }
    } else if let Some(ref v) = legacy_value {
        if let Some(legacy_ui) = legacy_ui_from_value(v) {
            ui = legacy_ui;
            need_migrate = true;
        }
    }

    if need_migrate {
        let _ = write_json(&settings_file, &runtime);
        let _ = write_json(&ui_file, &ui);
    }

    ShellSettings::from_parts(runtime, ui)
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &ShellSettings) -> Result<(), String> {
    let settings_file = settings_path(app)?;
    let ui_file = ui_path(app)?;
    write_json(&settings_file, &settings.runtime())?;
    write_json(&ui_file, &normalize_ui(settings.ui()))?;
    Ok(())
}

/// 仅写运行时域（settings.json），避免与 UI 即时保存互相覆盖。
pub fn save_runtime<R: Runtime>(
    app: &AppHandle<R>,
    runtime: &RuntimeSettings,
) -> Result<(), String> {
    write_json(&settings_path(app)?, runtime)
}

/// 仅写 UI chrome（ui.json）。
pub fn save_ui<R: Runtime>(app: &AppHandle<R>, ui: &UiSettings) -> Result<(), String> {
    write_json(&ui_path(app)?, &normalize_ui(ui.clone()))
}

impl ShellSettings {
    pub fn npm_registry(&self) -> &'static str {
        match self.mirror {
            MirrorKind::Domestic => "https://registry.npmmirror.com",
            MirrorKind::Official => "https://registry.npmjs.org",
        }
    }

    pub fn node_download_url(&self) -> String {
        match self.mirror {
            MirrorKind::Domestic => format!(
                "https://npmmirror.com/mirrors/node/{}/{}.zip",
                paths::NODE_VERSION,
                paths::NODE_DIST_NAME
            ),
            MirrorKind::Official => format!(
                "https://nodejs.org/dist/{}/{}.zip",
                paths::NODE_VERSION,
                paths::NODE_DIST_NAME
            ),
        }
    }

    /// SHASUMS 始终走官方源，避免镜像校验文件与包不一致。
    pub fn node_shasums_url(&self) -> String {
        format!(
            "https://nodejs.org/dist/{}/SHASUMS256.txt",
            paths::NODE_VERSION
        )
    }

    /// 解析出可注入的代理 URL；Off → None。
    pub fn resolved_proxy_url(&self) -> Option<String> {
        match self.proxy_mode {
            ProxyMode::Off => None,
            ProxyMode::Custom => {
                let u = self.proxy_url.trim();
                if u.is_empty() {
                    None
                } else {
                    Some(u.to_string())
                }
            }
            ProxyMode::System => read_windows_system_proxy(),
        }
    }
}

/// 读 Windows「Internet 设置」系统代理；失败则返回 None（调用方当直连）。
fn read_windows_system_proxy() -> Option<String> {
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

fn normalize_proxy_server(raw: &str) -> Option<String> {
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
            cmd.env_remove("NO_PROXY");
            cmd.env_remove("no_proxy");
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
pub fn proxy_env_overrides(settings: &ShellSettings) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
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
            map.insert("NO_PROXY".into(), String::new());
            map.insert("no_proxy".into(), String::new());
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

    #[test]
    fn default_close_to_tray_true() {
        assert!(ShellSettings::default().close_to_tray);
    }

    #[test]
    fn serde_roundtrip_preserves_close_to_tray() {
        let s = ShellSettings {
            mirror: MirrorKind::Official,
            proxy_mode: ProxyMode::Custom,
            proxy_url: "http://127.0.0.1:7890".into(),
            dsh_home_override: r"D:\dsh".into(),
            close_to_tray: false,
            close_pref_set: true,
            ..Default::default()
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: ShellSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.mirror, MirrorKind::Official);
        assert_eq!(back.proxy_mode, ProxyMode::Custom);
        assert_eq!(back.proxy_url, "http://127.0.0.1:7890");
        assert_eq!(back.dsh_home_override, r"D:\dsh");
        assert!(!back.close_to_tray);
        assert!(back.close_pref_set);
    }

    #[test]
    fn missing_close_fields_default() {
        let json = r#"{"mirror":"domestic","proxyMode":"off","proxyUrl":""}"#;
        let s: ShellSettings = serde_json::from_str(json).unwrap();
        assert!(s.close_to_tray);
        assert!(!s.close_pref_set);
        assert!(s.dsh_home_override.is_empty());
    }

    #[test]
    fn npm_registry_domestic_and_official() {
        let mut s = ShellSettings::default();
        assert!(s.npm_registry().contains("npmmirror"));
        s.mirror = MirrorKind::Official;
        assert!(s.npm_registry().contains("npmjs"));
    }

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
    fn runtime_settings_omits_ui_on_serialize() {
        let r = RuntimeSettings {
            mirror: MirrorKind::Official,
            proxy_mode: ProxyMode::Off,
            proxy_url: String::new(),
            dsh_home_override: String::new(),
            close_to_tray: true,
            close_pref_set: false,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(!json.contains("titlebar"));
    }

    #[test]
    fn legacy_ui_extracted_from_combined_json() {
        let v: Value = serde_json::from_str(
            r#"{"mirror":"domestic","proxyMode":"off","proxyUrl":"","titlebarStyle":"gray","titlebarCompact":true}"#,
        )
        .unwrap();
        let ui = legacy_ui_from_value(&v).unwrap();
        assert_eq!(ui.titlebar_style, TitlebarStyle::Gray);
        assert!(ui.titlebar_compact);
    }

    #[test]
    fn split_roundtrip_parts() {
        let s = ShellSettings {
            titlebar_style: TitlebarStyle::Gray,
            titlebar_compact: true,
            proxy_url: "http://x".into(),
            ..Default::default()
        };
        let again = ShellSettings::from_parts(s.runtime(), s.ui());
        assert_eq!(again.titlebar_style, TitlebarStyle::Gray);
        assert!(again.titlebar_compact);
        assert_eq!(again.proxy_url, "http://x");
    }
}
