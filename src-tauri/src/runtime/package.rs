//! 解析托管 `@deepseek-ai/dsh` 入口（固定相对路径 + package.json bin 兜底）。
//! 版本 / digest 供状态与关于页（R4 → B6）。

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
