//! 运行时路径：AppData 放程序，默认 `$DSH_HOME=~/.dsh` 放用户数据。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Runtime};

pub const NODE_VERSION: &str = "v22.22.0";
pub const NODE_DIST_NAME: &str = "node-v22.22.0-win-x64";
pub const DSH_PACKAGE: &str = "@deepseek-ai/dsh";
/// 相对 harness 根的官方入口；包结构漂移时由 runtime::package 解析兜底。
pub const DSH_ENTRY_RELATIVE: &str = "node_modules/@deepseek-ai/dsh/lib/bin.js";
pub const PID_FILE_NAME: &str = ".harness.pid";
/// 跨进程改盘互斥（壳更新 / harness 更新 / reset / ensure）
pub const RUNTIME_LOCK_FILE_NAME: &str = ".runtime.lock";
/// 与 tauri.conf identifier 对齐；Roaming 下默认目录名。
pub const APP_DATA_BUNDLE_DIR: &str = "com.deepseek.harness.desktop";
pub const HOSTED_DSH_HOME_DIR: &str = "dsh-home";

static RESOLVED_APP_DATA: OnceLock<PathBuf> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirResolveResult {
    pub path: String,
    pub adjusted: bool,
    pub conflict_path: Option<String>,
    /// 用户显式选择的路径不可用（非空且非本应用数据）
    pub occupied: bool,
}

pub fn base_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let _ = app;
    Ok(RESOLVED_APP_DATA
        .get_or_init(resolve_app_data_dir)
        .clone())
}

/// 审计专用：落盘测试时指向临时 Roaming 根（生产环境不设置）。
pub const PATH_AUDIT_ROAMING_ENV: &str = "DSH_PATH_AUDIT_ROAMING";

/// Roaming 根（Windows `%APPDATA%`）。
pub fn roaming_data_root() -> PathBuf {
    if let Ok(v) = std::env::var(PATH_AUDIT_ROAMING_ENV) {
        let trimmed = v.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    dirs::data_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// Tauri 默认 AppData 路径（未做冲突避让）。
pub fn default_tauri_app_data_dir() -> PathBuf {
    roaming_data_root().join(APP_DATA_BUNDLE_DIR)
}

pub fn resolve_app_data_dir() -> PathBuf {
    PathBuf::from(resolve_app_data_dir_with_meta().path)
}

pub fn resolve_app_data_dir_with_meta() -> DirResolveResult {
    let root = roaming_data_root();
    let primary = root.join(APP_DATA_BUNDLE_DIR);
    resolve_directory_slot(&primary, is_our_app_data_dir, app_data_suffixes())
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
        Err("runtime install is Windows-only for now".into())
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

/// 「壳来准备」默认独立 profile（不与 CLI ~/.dsh 混用）；目录非空且非本壳时自动加后缀。
pub fn hosted_dsh_home<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(PathBuf::from(resolve_hosted_dsh_home_with_meta(app)?.path))
}

pub fn resolve_hosted_dsh_home_with_meta<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<DirResolveResult, String> {
    let slot = hosted_dsh_home_primary(app)?;
    Ok(resolve_hosted_dsh_home_slot_with_meta(&slot))
}

pub fn hosted_dsh_home_primary<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join(HOSTED_DSH_HOME_DIR))
}

/// 首跑：是否可复用已有托管 DSH_HOME（本壳曾写入的数据）。
pub fn hosted_dsh_home_reuse_meta(
    primary: &Path,
    resolved_path: &str,
) -> (bool, Option<String>) {
    if is_our_dsh_home(primary) {
        return (true, Some(primary.to_string_lossy().into_owned()));
    }
    let resolved = PathBuf::from(resolved_path);
    if resolved != primary && is_our_dsh_home(&resolved) {
        return (true, Some(resolved_path.to_owned()));
    }
    (false, None)
}

pub fn resolve_hosted_dsh_home_slot_with_meta(primary: &Path) -> DirResolveResult {
    evaluate_hosted_dsh_home_slot(primary, true)
}

pub fn evaluate_hosted_dsh_home_slot(primary: &Path, auto_adjust: bool) -> DirResolveResult {
    if can_use_directory(primary, is_our_dsh_home) {
        return DirResolveResult {
            path: primary.to_string_lossy().into_owned(),
            adjusted: false,
            conflict_path: None,
            occupied: false,
        };
    }
    if auto_adjust {
        return resolve_directory_slot(primary, is_our_dsh_home, dsh_home_suffixes());
    }
    DirResolveResult {
        path: primary.to_string_lossy().into_owned(),
        adjusted: false,
        conflict_path: None,
        occupied: true,
    }
}

/// 首跑 / 设置：按模式解析 DSH_HOME 候选路径。
pub fn resolve_dsh_home_for_mode(
    path: &str,
    mode: &str,
    auto_adjust: bool,
) -> Result<DirResolveResult, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".into());
    }
    let primary = PathBuf::from(trimmed);
    let result = if mode == "local" {
        // 沿用本机：允许复用已有 ~/.dsh（含数据）
        DirResolveResult {
            path: primary.to_string_lossy().into_owned(),
            adjusted: false,
            conflict_path: None,
            occupied: false,
        }
    } else {
        evaluate_hosted_dsh_home_slot(&primary, auto_adjust)
    };
    Ok(result)
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

/// 会话级干净 profile：仅本壳托管 spawn 使用，不删用户 `~/.dsh`。
pub fn clean_profile_session_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(base_dir(app)?.join("clean-profile-session"))
}

/// 「重置配置」目标校验：仅允许删用户选定的 DSH_HOME，禁止盘符根 / 用户主目录 / 壳程序目录。
pub fn validate_dsh_home_reset_target<R: Runtime>(
    app: &AppHandle<R>,
    home: &Path,
) -> Result<(), String> {
    if !home.is_absolute() {
        return Err("DSH_HOME 须为绝对路径".into());
    }
    let home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
    if let Some(user_home) = dirs::home_dir() {
        let user_home = user_home.canonicalize().unwrap_or(user_home);
        if home == user_home {
            return Err("不能清空用户主目录".into());
        }
    }
    if home.parent().is_none_or(|p| p.as_os_str().is_empty()) {
        return Err("不能清空盘符根目录".into());
    }
    let app_base = base_dir(app)?;
    let app_base = app_base.canonicalize().unwrap_or(app_base);
    if home == app_base {
        return Err("不能清空应用 AppData 根目录".into());
    }
    let clean = clean_profile_session_dir(app)?;
    let clean = clean.canonicalize().unwrap_or(clean);
    if home == clean {
        return Err("不能清空临时干净 profile 目录".into());
    }
    Ok(())
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

pub fn is_dir_nonempty(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    if path.is_file() {
        return true;
    }
    std::fs::read_dir(path)
        .map(|mut rd| rd.next().is_some())
        .unwrap_or(true)
}

fn can_use_directory(path: &Path, is_ours: fn(&Path) -> bool) -> bool {
    !is_dir_nonempty(path) || is_ours(path)
}

pub(crate) fn resolve_directory_slot(
    primary: &Path,
    is_ours: fn(&Path) -> bool,
    suffixes: &[&str],
) -> DirResolveResult {
    if can_use_directory(primary, is_ours) {
        return DirResolveResult {
            path: primary.to_string_lossy().into_owned(),
            adjusted: false,
            conflict_path: None,
            occupied: false,
        };
    }

    let parent = primary.parent().unwrap_or_else(|| Path::new("."));
    let stem = primary
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(HOSTED_DSH_HOME_DIR);

    for suffix in suffixes {
        let alt = parent.join(format!("{stem}{suffix}"));
        if can_use_directory(&alt, is_ours) {
            return DirResolveResult {
                path: alt.to_string_lossy().into_owned(),
                adjusted: true,
                conflict_path: Some(primary.to_string_lossy().into_owned()),
                occupied: false,
            };
        }
    }

    // 全部固定后缀占满：绝不能回写 foreign 主路径；落紧急槽位。
    let emerg = parent.join(format!(
        "{stem}-emerg-{}",
        std::process::id()
    ));
    DirResolveResult {
        path: emerg.to_string_lossy().into_owned(),
        adjusted: true,
        conflict_path: Some(primary.to_string_lossy().into_owned()),
        occupied: true,
    }
}

pub(crate) fn app_data_suffixes() -> &'static [&'static str] {
    &["-shell", "-desktop", "-2", "-3", "-4", "-5"]
}

pub(crate) fn dsh_home_suffixes() -> &'static [&'static str] {
    &["-desktop", "-2", "-3", "-4", "-5"]
}

/// Roaming 目录是否为本壳数据（settings / runtime / harness 等）。
pub fn is_our_app_data_dir(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    path.join("settings.json").is_file()
        || path.join("harness").is_dir()
        || path.join("runtime").is_dir()
        || path.join(PID_FILE_NAME).is_file()
        || path.join(RUNTIME_LOCK_FILE_NAME).is_file()
        || path.join("logs").is_dir()
}

/// DSH_HOME 槽位是否已有本应用/DSH 数据。
pub fn is_our_dsh_home(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    path.join("settings.yaml").is_file()
        || path.join("conversations").is_dir()
        || path.join("plugins").is_dir()
        || path.join("sessions").is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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

    #[test]
    fn empty_dir_is_available() {
        let tmp = std::env::temp_dir().join(format!(
            "dsh-path-test-empty-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&tmp);
        assert!(!is_dir_nonempty(&tmp));
        let r = resolve_directory_slot(&tmp, is_our_dsh_home, dsh_home_suffixes());
        assert!(!r.adjusted);
        assert_eq!(r.path, tmp.to_string_lossy());
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn foreign_nonempty_gets_suffix() {
        let base = std::env::temp_dir().join(format!(
            "dsh-path-test-foreign-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("foreign.txt"), b"x").unwrap();
        let r = resolve_directory_slot(&base, is_our_dsh_home, dsh_home_suffixes());
        assert!(r.adjusted);
        assert!(r.path.ends_with("-desktop"));
        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(PathBuf::from(&r.path));
    }

    #[test]
    fn our_app_data_dir_is_reused() {
        let base = std::env::temp_dir().join(format!(
            "dsh-path-test-ours-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("settings.json"), b"{}").unwrap();
        let r = resolve_directory_slot(&base, is_our_app_data_dir, app_data_suffixes());
        assert!(!r.adjusted);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn local_mode_keeps_nonempty_path() {
        let p = r"C:\Users\me\.dsh";
        let r = resolve_dsh_home_for_mode(p, "local", true).unwrap();
        assert!(!r.adjusted);
        assert!(!r.occupied);
        assert_eq!(r.path, p);
    }

    #[test]
    fn hosted_explicit_pick_occupied() {
        let base = std::env::temp_dir().join(format!(
            "dsh-path-test-explicit-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("foreign.txt"), b"x").unwrap();
        let r = evaluate_hosted_dsh_home_slot(&base, false);
        assert!(r.occupied);
        let _ = fs::remove_dir_all(&base);
    }
}
