//! 运行时路径：AppData 放程序，默认 `$DSH_HOME=~/.dsh` 放用户数据。

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

pub const NODE_VERSION: &str = "v22.22.0";
pub const NODE_DIST_NAME: &str = "node-v22.22.0-win-x64";
pub const DSH_PACKAGE: &str = "@deepseek-ai/dsh";
/// 相对 harness 根的官方入口；包结构漂移时由 runtime::package 解析兜底。
pub const DSH_ENTRY_RELATIVE: &str = "node_modules/@deepseek-ai/dsh/lib/bin.js";
pub const PID_FILE_NAME: &str = ".harness.pid";
/// 跨进程改盘互斥（壳更新 / harness 更新 / reset / ensure）
pub const RUNTIME_LOCK_FILE_NAME: &str = ".runtime.lock";

pub fn base_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))
}

pub fn runtime_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join("runtime"))
}

pub fn node_install_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(runtime_dir(app)?.join(NODE_DIST_NAME))
}

pub fn node_binary<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        Ok(node_install_dir(app)?.join("node.exe"))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("B2 runtime install is Windows-only for now".into())
    }
}

pub fn npm_cli_js<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(node_install_dir(app)?
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js"))
}

pub fn harness_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join("harness"))
}

pub fn dsh_entry<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(harness_dir(app)?.join(DSH_ENTRY_RELATIVE))
}

/// 用户数据根：caller 传入设置覆盖；默认与官方 CLI 互通 `~/.dsh`。
/// 路径层不读 settings，避免 paths→settings 反向依赖。
pub fn resolve_dsh_home(override_path: Option<&str>) -> PathBuf {
    if let Some(raw) = override_path {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".dsh")
}

pub fn dsh_home<R: Runtime>(_app: &AppHandle<R>, override_path: Option<&str>) -> PathBuf {
    resolve_dsh_home(override_path)
}

pub fn pid_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join(PID_FILE_NAME))
}

pub fn runtime_lock_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join(RUNTIME_LOCK_FILE_NAME))
}

pub fn service_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

pub fn harness_log_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join("logs").join("harness.log"))
}

/// 壳侧运维日志（更新 / 安装进度），与 harness 子进程 stdout 分开。
pub fn shell_log_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join("logs").join("shell.log"))
}

/// debug 用 3081：避开官方默认 3080；若被占用则由 supervise 顺延。
pub fn default_port() -> u16 {
    if cfg!(debug_assertions) {
        3081
    } else {
        3080
    }
}

pub fn is_file(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_url_format() {
        assert_eq!(service_url(3081), "http://127.0.0.1:3081");
        assert_eq!(service_url(3080), "http://127.0.0.1:3080");
    }

    #[test]
    fn default_port_is_loopback_range() {
        let p = default_port();
        assert!((3080..=3100).contains(&p));
    }

    #[test]
    fn dsh_home_override_and_default() {
        let def = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".dsh");
        assert_eq!(resolve_dsh_home(None), def);
        assert_eq!(resolve_dsh_home(Some("")), def);
        assert_eq!(resolve_dsh_home(Some("  ")), def);
        assert_eq!(
            resolve_dsh_home(Some(r"D:\custom-dsh")),
            PathBuf::from(r"D:\custom-dsh")
        );
    }
}

