//! 壳设置类型与 IPC 聚合视图。

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::paths;
use crate::system_runtime::RuntimeSource;
use super::proxy::read_windows_system_proxy;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub enum MirrorKind {
    /// npmmirror（Node + npm），国内默认
    #[default]
    Domestic,
    /// nodejs.org + registry.npmjs.org
    Official,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProxyMode {
    #[default]
    Off,
    System,
    Custom,
}

/// 壳主题：与 DSH 相同 — 浅色 / 深色 / 跟随系统（真源 `settings.yaml`）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ShellTheme {
    Light,
    Dark,
    #[default]
    #[serde(alias = "follow")]
    System,
}

/// 壳语言：与 DSH 相同 — zh / en（真源 `settings.yaml` → `locale.preference`）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum ShellLocale {
    #[default]
    Zh,
    En,
}

/// 运行时必需：镜像 / 代理 / DSH_HOME / 关闭行为 / 端口 / CLI
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
    /// 0 = 使用壳默认（debug 3081 / release 3080）；占用则顺延
    #[serde(default)]
    pub preferred_port: u16,
    #[serde(default)]
    pub cli_link_enabled: bool,
    /// auto：本机可用则系统，否则托管；system / hosted 强制
    #[serde(default)]
    pub runtime_source: RuntimeSource,
    /// 首跑向导已完成
    #[serde(default)]
    pub onboarding_done: bool,
}

/// 纯壳 UI chrome（主题不在此：真源 DSH settings.yaml）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    #[serde(default)]
    pub titlebar_compact: bool,
    /// 减少误选 chrome 文字（注入；默认关；宁缺毋滥）
    #[serde(default)]
    pub selection_hygiene: bool,
    /// 简洁模式：藏官方 Session log，改由顶栏下载 icon 代理点击
    #[serde(default = "default_true")]
    pub session_log_in_titlebar: bool,
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
    pub preferred_port: u16,
    #[serde(default)]
    pub cli_link_enabled: bool,
    #[serde(default)]
    pub runtime_source: RuntimeSource,
    #[serde(default)]
    pub onboarding_done: bool,
    /// 前端聚合字段；Rust `load` 不写（由 ChromeProvider 拉 DSH）
    #[serde(default)]
    pub shell_theme: ShellTheme,
    /// 前端聚合字段；Rust `load` 不写（由 LocaleProvider 拉 DSH）
    #[serde(default)]
    pub shell_locale: ShellLocale,
    #[serde(default)]
    pub titlebar_compact: bool,
    #[serde(default)]
    pub selection_hygiene: bool,
    #[serde(default = "default_true")]
    pub session_log_in_titlebar: bool,
}

pub(crate) fn default_true() -> bool {
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
            preferred_port: 0,
            cli_link_enabled: false,
            runtime_source: RuntimeSource::Hosted,
            onboarding_done: false,
        }
    }
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            titlebar_compact: false,
            selection_hygiene: false,
            session_log_in_titlebar: true,
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
            preferred_port: runtime.preferred_port,
            cli_link_enabled: runtime.cli_link_enabled,
            runtime_source: runtime.runtime_source,
            onboarding_done: runtime.onboarding_done,
            shell_theme: ShellTheme::System,
            shell_locale: ShellLocale::Zh,
            titlebar_compact: ui.titlebar_compact,
            selection_hygiene: ui.selection_hygiene,
            session_log_in_titlebar: ui.session_log_in_titlebar,
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
            preferred_port: self.preferred_port,
            cli_link_enabled: self.cli_link_enabled,
            runtime_source: self.runtime_source,
            onboarding_done: self.onboarding_done,
        }
    }

    pub fn ui(&self) -> UiSettings {
        UiSettings {
            titlebar_compact: self.titlebar_compact,
            selection_hygiene: self.selection_hygiene,
            session_log_in_titlebar: self.session_log_in_titlebar,
        }
    }

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
