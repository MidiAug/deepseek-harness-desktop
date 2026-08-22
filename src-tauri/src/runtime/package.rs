//! 解析托管 `@deepseek-ai/dsh` 入口（固定相对路径 + package.json bin 兜底）。
//! 版本 / digest 供状态与关于页（R4 → B6）。
//! 闭包完整性（B13）：npm 后断言入口 + 声明的 `@deepseek-ai/*` 依赖目录。

use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};

use crate::paths;

/// 本地 harness 元数据（可读摘要，非强签名）。
#[derive(Debug, Clone, Default)]
pub struct HarnessMeta {
    pub version: Option<String>,
    /// package.json 内容 SHA-256 前 16 hex（稳定、短）
    pub digest: Option<String>,
}

/// 优先固定相对路径；否则读 package.json 的 bin 字段兜底。
pub fn resolve_dsh_entry<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let primary = paths::dsh_entry(app)?;
    if paths::is_file(&primary) {
        return Ok(primary);
    }

    let pkg = dsh_package_json(app)?;
    if !pkg.is_file() {
        return Ok(primary);
    }
    let text = fs::read_to_string(&pkg).map_err(|e| format!("read dsh package.json: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("parse dsh package.json: {e}"))?;
    let bin = json.get("bin").and_then(|b| {
        if let Some(s) = b.as_str() {
            Some(s.to_string())
        } else {
            b.get("dsh").and_then(|v| v.as_str()).map(|s| s.to_string())
        }
    });
    if let Some(rel) = bin {
        let candidate = paths::harness_dir(app)?
            .join("node_modules")
            .join("@deepseek-ai")
            .join("dsh")
            .join(rel);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Ok(primary)
}

fn dsh_package_json<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(paths::harness_dir(app)?
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("package.json"))
}

/// npm 安装后闭包门禁：入口文件 + dsh 声明的 `@deepseek-ai/*` 依赖目录须存在。
pub fn assert_harness_closure<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let entry = resolve_dsh_entry(app)?;
    if !paths::is_file(&entry) {
        return Err(format!(
            "INSTALL_FAILED: 安装后未找到入口 {}",
            entry.display()
        ));
    }
    let pkg = dsh_package_json(app)?;
    if !pkg.is_file() {
        return Err(format!(
            "INSTALL_FAILED: 缺少 dsh package.json（{}）",
            pkg.display()
        ));
    }
    let text = fs::read_to_string(&pkg)
        .map_err(|e| format!("INSTALL_FAILED: 读 dsh package.json: {e}"))?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("INSTALL_FAILED: 解析 dsh package.json: {e}"))?;

    let mut missing: Vec<String> = Vec::new();
    // 仅硬依赖：optionalDependencies 允许缺席
    let harness = paths::harness_dir(app)?;
    let dsh_root = harness
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh");
    if let Some(deps) = json.get("dependencies").and_then(|v| v.as_object()) {
        for name in deps.keys() {
            if !name.starts_with("@deepseek-ai/") {
                continue;
            }
            let short = name.trim_start_matches("@deepseek-ai/");
            let top = harness
                .join("node_modules")
                .join("@deepseek-ai")
                .join(short);
            let nested = dsh_root
                .join("node_modules")
                .join("@deepseek-ai")
                .join(short);
            if !top.is_dir() && !nested.is_dir() {
                missing.push(name.clone());
            }
        }
    }
    if !missing.is_empty() {
        missing.sort();
        return Err(format!(
            "INSTALL_FAILED: harness 闭包不完整，缺少依赖：{}。请重试安装或「重置托管运行时」。",
            missing.join(", ")
        ));
    }
    Ok(())
}

/// 入口文件缺失，但 harness 树里已有依赖痕迹（中断更新/半安装）。
pub fn is_harness_partial<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(entry) = resolve_dsh_entry(app) else {
        return false;
    };
    if paths::is_file(&entry) {
        return false;
    }
    let Ok(harness) = paths::harness_dir(app) else {
        return false;
    };
    if harness.join("package.json").is_file() {
        return true;
    }
    let scope = harness.join("node_modules").join("@deepseek-ai");
    match fs::read_dir(&scope) {
        Ok(rd) => rd.filter_map(|e| e.ok()).next().is_some(),
        Err(_) => false,
    }
}

/// 读已安装 harness 的 version + digest；未安装则字段为空。
pub fn read_harness_meta<R: Runtime>(app: &AppHandle<R>) -> HarnessMeta {
    let Ok(pkg) = dsh_package_json(app) else {
        return HarnessMeta::default();
    };
    read_harness_meta_at(&pkg)
}

fn read_harness_meta_at(pkg: &Path) -> HarnessMeta {
    let Ok(text) = fs::read_to_string(pkg) else {
        return HarnessMeta::default();
    };
    let version = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("version")?.as_str().map(|s| s.to_string()));
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let digest = Some(hex::encode(hasher.finalize())[..16].to_string());
    HarnessMeta { version, digest }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn meta_from_package_json() {
        let dir = std::env::temp_dir().join(format!("dsh-meta-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let pkg = dir.join("package.json");
        let mut f = fs::File::create(&pkg).unwrap();
        write!(f, r#"{{"name":"@deepseek-ai/dsh","version":"1.2.3"}}"#).unwrap();
        let meta = read_harness_meta_at(&pkg);
        assert_eq!(meta.version.as_deref(), Some("1.2.3"));
        assert_eq!(meta.digest.as_ref().map(|d| d.len()), Some(16));
        let _ = fs::remove_dir_all(&dir);
    }
}
