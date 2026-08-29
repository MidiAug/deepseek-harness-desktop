//! 解析托管 `@deepseek-ai/dsh` 入口（固定相对路径 + package.json bin 兜底）。
//! 版本 / digest 供状态与关于页。
//! 闭包完整性：npm 后断言入口 + 声明的 `@deepseek-ai/*` 依赖目录。

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
    let harness = paths::harness_dir(app)?;
    let primary = paths::dsh_entry(app)?;
    let pkg = dsh_package_json(app)?;
    Ok(resolve_dsh_entry_at(&harness, &primary, &pkg))
}

/// 路径版入口解析（可测）。
pub fn resolve_dsh_entry_at(harness_dir: &Path, primary: &Path, pkg: &Path) -> PathBuf {
    if paths::is_file(primary) {
        return primary.to_path_buf();
    }
    if !pkg.is_file() {
        return primary.to_path_buf();
    }
    let Ok(text) = fs::read_to_string(pkg) else {
        return primary.to_path_buf();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return primary.to_path_buf();
    };
    let bin = json.get("bin").and_then(|b| {
        if let Some(s) = b.as_str() {
            Some(s.to_string())
        } else {
            b.get("dsh").and_then(|v| v.as_str()).map(|s| s.to_string())
        }
    });
    if let Some(rel) = bin {
        let candidate = harness_dir
            .join("node_modules")
            .join("@deepseek-ai")
            .join("dsh")
            .join(rel);
        if candidate.is_file() {
            return candidate;
        }
    }
    primary.to_path_buf()
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
    let pkg = dsh_package_json(app)?;
    let harness = paths::harness_dir(app)?;
    crate::host_resilience::assert_harness_closure_at(&harness, &entry, &pkg)
}

/// 入口文件缺失，但 harness 树里已有依赖痕迹（中断更新/半安装）。
pub fn is_harness_partial<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Ok(entry) = resolve_dsh_entry(app) else {
        return false;
    };
    let Ok(harness) = paths::harness_dir(app) else {
        return false;
    };
    crate::host_resilience::is_harness_partial_at(&harness, &entry)
}

/// 读已安装 harness 的 version + digest；未安装则字段为空。
pub fn read_harness_meta<R: Runtime>(app: &AppHandle<R>) -> HarnessMeta {
    let Ok(pkg) = dsh_package_json(app) else {
        return HarnessMeta::default();
    };
    read_harness_meta_at_pkg(&pkg)
}

/// 从本机 dsh 入口（`…/dsh/lib/bin.js`）反查 package.json。
pub fn read_harness_meta_from_system_entry(entry: &Path) -> HarnessMeta {
    let Some(pkg) = entry
        .parent()
        .and_then(|lib| lib.parent())
        .map(|dsh| dsh.join("package.json"))
    else {
        return HarnessMeta::default();
    };
    read_harness_meta_at_pkg(&pkg)
}

/// 按当前/配置的运行时来源读 version + digest（系统 dsh 与托管 AppData 统一口径）。
pub fn resolve_effective_harness_meta<R: Runtime>(
    app: &AppHandle<R>,
    state: &crate::supervise::HarnessState,
) -> HarnessMeta {
    use crate::settings;
    use crate::system_runtime::{self, ActiveRuntimeKind, RuntimeSource};

    if let Ok(guard) = state.active_runtime.lock() {
        if let Some(kind) = *guard {
            return match kind {
                ActiveRuntimeKind::System => system_runtime::resolve_system_runtime()
                    .map(|rt| read_harness_meta_from_system_entry(&rt.entry))
                    .unwrap_or_default(),
                ActiveRuntimeKind::Hosted => read_harness_meta(app),
            };
        }
    }

    let cfg = settings::load(app);
    match cfg.runtime_source {
        RuntimeSource::Hosted => read_harness_meta(app),
        RuntimeSource::System | RuntimeSource::Auto => system_runtime::resolve_system_runtime()
            .map(|rt| read_harness_meta_from_system_entry(&rt.entry))
            .unwrap_or_else(|| read_harness_meta(app)),
    }
}

/// 从 package.json 路径读 version + digest。
pub fn read_harness_meta_at_pkg(pkg: &Path) -> HarnessMeta {
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
        let meta = read_harness_meta_at_pkg(&pkg);
        assert_eq!(meta.version.as_deref(), Some("1.2.3"));
        assert_eq!(meta.digest.as_ref().map(|d| d.len()), Some(16));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn entry_prefers_primary_when_present() {
        let root = std::env::temp_dir().join(format!("dsh-entry-pri-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let primary = root.join("node_modules/@deepseek-ai/dsh/lib/bin.js");
        fs::create_dir_all(primary.parent().unwrap()).unwrap();
        fs::write(&primary, "primary").unwrap();
        let pkg = root.join("node_modules/@deepseek-ai/dsh/package.json");
        fs::write(
            &pkg,
            r#"{"bin":{"dsh":"cli-alt.js"}}"#,
        )
        .unwrap();
        let got = resolve_dsh_entry_at(&root, &primary, &pkg);
        assert_eq!(got, primary);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn entry_falls_back_to_package_bin() {
        let root = std::env::temp_dir().join(format!("dsh-entry-bin-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let primary = root.join("node_modules/@deepseek-ai/dsh/lib/bin.js");
        let alt = root.join("node_modules/@deepseek-ai/dsh/cli-alt.js");
        fs::create_dir_all(alt.parent().unwrap()).unwrap();
        fs::write(&alt, "alt").unwrap();
        let pkg = root.join("node_modules/@deepseek-ai/dsh/package.json");
        fs::write(
            &pkg,
            r#"{"bin":{"dsh":"cli-alt.js"}}"#,
        )
        .unwrap();
        assert!(!primary.is_file());
        let got = resolve_dsh_entry_at(&root, &primary, &pkg);
        assert_eq!(got, alt);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn system_entry_meta_walks_up_to_package() {
        let root = std::env::temp_dir().join(format!("dsh-sys-meta-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let entry = root.join("lib/bin.js");
        fs::create_dir_all(entry.parent().unwrap()).unwrap();
        fs::write(&entry, "x").unwrap();
        fs::write(root.join("package.json"), r#"{"version":"9.9.9"}"#).unwrap();
        let meta = read_harness_meta_from_system_entry(&entry);
        assert_eq!(meta.version.as_deref(), Some("9.9.9"));
        let _ = fs::remove_dir_all(&root);
    }
}
