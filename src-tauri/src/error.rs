//! 命令边界错误：稳定前缀码，便于前端与日志分类（B6 前置）。

use thiserror::Error;

#[derive(Debug, Error)]
pub enum HostError {
    #[error("INSTALL_FAILED: {0}")]
    Install(String),
    #[error("SPAWN_FAILED: {0}")]
    Spawn(String),
    #[error("NODE_MISSING: {0}")]
    NodeMissing(String),
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
}
