//! 探测本机已装 Node + `@deepseek-ai/dsh`（系统运行时）。

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeSource {
    /// 能探测到本机 dsh 则用系统，否则托管
    #[default]
    Auto,
    /// 强制本机；失败则报错
    System,
    /// 强制壳 AppData 托管
    Hosted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActiveRuntimeKind {
    System,
    Hosted,
}

#[derive(Debug, Clone)]
pub struct SystemRuntime {
    pub node: PathBuf,
    pub entry: PathBuf,
    pub cwd: PathBuf,
}

/// Windows：优先 npm/系统 Node（排除 IDE 内置），再匹配 dsh 入口。
pub fn resolve_system_runtime() -> Option<SystemRuntime> {
    #[cfg(windows)]
    {
        let entry = global_dsh_entry().or_else(|| {
            resolve_system_node()
                .and_then(|node| resolve_via_node(&node))
        })?;
        if !entry.is_file() {
            return None;
        }
        let node = resolve_system_node_for_entry(&entry)?;
        if !node.is_file() {
            return None;
        }
        let cwd = entry
            .parent()
            .and_then(|p| p.parent()) // lib/
            .and_then(|p| p.parent()) // @deepseek-ai/dsh
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| entry.parent().unwrap_or(Path::new(".")).to_path_buf());
        Some(SystemRuntime { node, entry, cwd })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// 解析用于 spawn 的系统 Node（公开供 probe IPC 使用）。
pub fn resolve_system_node() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        resolve_system_node_inner()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn resolve_system_node_for_entry(entry: &Path) -> Option<PathBuf> {
    if let Some(node) = resolve_system_node_inner() {
        if resolve_via_node(&node).as_deref() == Some(entry) {
            return Some(node);
        }
    }
    // 回落：任一能 resolve 同一包的 node
    for node in where_all("node.exe")
        .into_iter()
        .chain(where_all("node"))
    {
        if node.is_file() && resolve_via_node(&node).as_deref() == Some(entry) {
            return Some(node);
        }
    }
    resolve_system_node_inner()
}

#[cfg(windows)]
fn resolve_system_node_inner() -> Option<PathBuf> {
    if let Some(node) = npm_global_node() {
        if node.is_file() {
            return Some(node);
        }
    }

    let candidates = where_all("node.exe");
    let candidates = if candidates.is_empty() {
        where_all("node")
    } else {
        candidates
    };

    for node in candidates.iter().filter(|n| !is_ide_bundled_node(n)) {
        if node.is_file() && resolve_via_node(node).is_some() {
            return Some(node.clone());
        }
    }

    candidates
        .iter()
        .find(|n| n.is_file() && !is_ide_bundled_node(n))
        .cloned()
        .or_else(|| candidates.first().cloned())
}

#[cfg(windows)]
fn npm_global_node() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let node = PathBuf::from(appdata).join("npm").join("node.exe");
    node.is_file().then_some(node)
}

#[cfg(windows)]
fn is_ide_bundled_node(path: &Path) -> bool {
    let lower = path.to_string_lossy().to_lowercase();
    lower.contains("cursor")
        || lower.contains("vscode")
        || lower.contains("\\code\\")
        || lower.contains("visual studio")
}

#[cfg(windows)]
fn where_all(cmd: &str) -> Vec<PathBuf> {
    let Some(out) = Command::new("where.exe").arg(cmd).output().ok() else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
        .collect()
}

#[cfg(windows)]
fn global_dsh_entry() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let entry = PathBuf::from(appdata)
        .join("npm")
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js");
    entry.is_file().then_some(entry)
}

#[cfg(windows)]
fn resolve_via_node(node: &Path) -> Option<PathBuf> {
    let script =
        "try{const p=require.resolve('@deepseek-ai/dsh/package.json');process.stdout.write(p)}catch(e){process.exit(1)}";
    let out = Command::new(node)
        .args(["-e", script])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let pkg = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if pkg.is_empty() {
        return None;
    }
    let entry = PathBuf::from(pkg)
        .parent()?
        .join("lib")
        .join("bin.js");
    entry.is_file().then_some(entry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_source_serde() {
        let a: RuntimeSource = serde_json::from_str(r#""auto""#).unwrap();
        assert_eq!(a, RuntimeSource::Auto);
        let s: RuntimeSource = serde_json::from_str(r#""system""#).unwrap();
        assert_eq!(s, RuntimeSource::System);
        let h: RuntimeSource = serde_json::from_str(r#""hosted""#).unwrap();
        assert_eq!(h, RuntimeSource::Hosted);
    }

    #[test]
    fn runtime_settings_default_auto() {
        let r: crate::settings::RuntimeSettings = serde_json::from_str(
            r#"{"mirror":"domestic","proxyMode":"off","proxyUrl":""}"#,
        )
        .unwrap();
        assert_eq!(r.runtime_source, RuntimeSource::Auto);
    }

    #[test]
    fn is_ide_bundled_node_detects_cursor() {
        assert!(is_ide_bundled_node(Path::new(
            r"c:\Program Files\cursor\resources\app\resources\helpers\node.exe"
        )));
        assert!(!is_ide_bundled_node(Path::new(
            r"C:\Program Files\nodejs\node.exe"
        )));
    }

    #[test]
    fn resolve_system_node_prefers_non_ide() {
        let node = resolve_system_node();
        if let Some(n) = node {
            assert!(
                !is_ide_bundled_node(&n),
                "expected non-IDE node, got {}",
                n.display()
            );
        }
    }

    #[test]
    fn resolve_system_runtime_smoke_on_dev_machine() {
        let _ = resolve_system_runtime();
    }
}
