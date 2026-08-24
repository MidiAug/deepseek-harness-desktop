//! 命令边界错误：稳定前缀码，便于前端与日志分类。

use thiserror::Error;

#[derive(Debug, Error)]
pub enum HostError {
    #[error("INSTALL_FAILED: {0}")]
    Install(String),
    #[error("SPAWN_FAILED: {0}")]
    Spawn(String),
    #[error("NODE_MISSING: {0}")]
    NodeMissing(String),
    #[error("HEALTH_TIMEOUT: {0}")]
    HealthTimeout(String),
    #[error("HARNESS_NOT_FOUND: {0}")]
    HarnessNotFound(String),
    #[error("PLUGIN_LOAD_FAILED: {0}")]
    PluginLoadFailed(String),
    #[error("OPEN_PATH: {0}")]
    OpenPath(String),
    #[error("HIDE: {0}")]
    Hide(String),
    #[error("{0}")]
    Msg(String),
}

impl HostError {
    pub fn install(msg: impl Into<String>) -> Self {
        Self::Install(msg.into())
    }

    pub fn spawn(msg: impl Into<String>) -> Self {
        Self::Spawn(msg.into())
    }

    pub fn node_missing(msg: impl Into<String>) -> Self {
        Self::NodeMissing(msg.into())
    }

    pub fn health_timeout(msg: impl Into<String>) -> Self {
        Self::HealthTimeout(msg.into())
    }

    pub fn harness_not_found(msg: impl Into<String>) -> Self {
        Self::HarnessNotFound(msg.into())
    }

    pub fn plugin_load_failed(msg: impl Into<String>) -> Self {
        Self::PluginLoadFailed(msg.into())
    }
}

impl From<HostError> for String {
    fn from(value: HostError) -> Self {
        value.to_string()
    }
}

/// 命令 Result 边界：`HostError` → String。
#[allow(dead_code)]
pub fn to_string_err<T>(r: Result<T, HostError>) -> Result<T, String> {
    r.map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_prefix_stable() {
        let s: String = HostError::install("网络超时").into();
        assert!(s.starts_with("INSTALL_FAILED:"));
        assert!(s.contains("网络超时"));
    }

    #[test]
    fn spawn_prefix_stable() {
        let s: String = HostError::spawn("端口占用").into();
        assert!(s.starts_with("SPAWN_FAILED:"));
    }

    #[test]
    fn health_timeout_prefix_stable() {
        let s: String = HostError::health_timeout("探活超时").into();
        assert!(s.starts_with("HEALTH_TIMEOUT:"));
        assert!(s.contains("探活超时"));
    }

    #[test]
    fn harness_not_found_prefix_stable() {
        let s: String = HostError::harness_not_found("/path/entry").into();
        assert!(s.starts_with("HARNESS_NOT_FOUND:"));
    }

    #[test]
    fn plugin_load_failed_prefix_stable() {
        let s: String = HostError::plugin_load_failed("插件加载超时").into();
        assert!(s.starts_with("PLUGIN_LOAD_FAILED:"));
    }
}
