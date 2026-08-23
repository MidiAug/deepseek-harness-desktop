//! 壳设置：运行时（settings.json）与 UI chrome（ui.json）分文件持久化。
//! IPC 仍聚合为 [`ShellSettings`]，减少前端冲击。

mod persist;
mod proxy;
mod types;

pub use persist::{load, save, save_runtime, save_ui};
pub use proxy::proxy_env_overrides;
pub use types::{RuntimeSettings, ShellLocale, ShellSettings, UiSettings};

#[cfg(test)]
mod tests {
    use super::types::{MirrorKind, ProxyMode, ShellTheme};
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
    fn runtime_settings_omits_ui_on_serialize() {
        let r = RuntimeSettings {
            mirror: MirrorKind::Official,
            proxy_mode: ProxyMode::Off,
            proxy_url: String::new(),
            dsh_home_override: String::new(),
            close_to_tray: true,
            close_pref_set: false,
            preferred_port: 0,
            cli_link_enabled: false,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(!json.contains("titlebar"));
    }

    #[test]
    fn shell_theme_follow_alias_is_system() {
        let t: ShellTheme = serde_json::from_str(r#""follow""#).unwrap();
        assert_eq!(t, ShellTheme::System);
        let t2: ShellTheme = serde_json::from_str(r#""system""#).unwrap();
        assert_eq!(t2, ShellTheme::System);
    }
}
