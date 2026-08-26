//! B50 路径身份落盘审计：在临时目录真实读写，输出 JSON 报告（供 `path_audit` 二进制 / 集成测试）。

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::paths::{
    self, app_data_suffixes, dsh_home_suffixes, is_our_app_data_dir, is_our_dsh_home,
    resolve_directory_slot, APP_DATA_BUNDLE_DIR, HOSTED_DSH_HOME_DIR,
};
use crate::settings::PathMeta;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathAuditCase {
    pub id: String,
    pub ok: bool,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathIdentityReport {
    pub timestamp: String,
    pub sandbox: String,
    pub ok: bool,
    pub cases: Vec<PathAuditCase>,
}

fn case(id: &str, ok: bool, detail: impl Into<String>, data: Option<serde_json::Value>) -> PathAuditCase {
    PathAuditCase {
        id: id.into(),
        ok,
        detail: detail.into(),
        data,
    }
}

fn fresh_sandbox(label: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!(
        "dsh-path-audit-{label}-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).expect("mkdir sandbox");
    p
}

fn teardown(sandbox: &Path) {
    let _ = fs::remove_dir_all(sandbox);
}

/// 在 `sandbox` 下跑 AppData / hosted DSH_HOME 槽位场景（不依赖 Tauri AppHandle）。
pub fn run_slot_scenarios(sandbox: &Path) -> Vec<PathAuditCase> {
    let mut out = Vec::new();

    // 1. 空槽 → 主路径
    let empty_primary = sandbox.join("case-empty").join(APP_DATA_BUNDLE_DIR);
    let _ = fs::remove_dir_all(empty_primary.parent().unwrap());
    let r = resolve_directory_slot(&empty_primary, is_our_app_data_dir, app_data_suffixes());
    out.push(case(
        "app_data_empty_primary",
        !r.adjusted && !r.occupied && r.path == empty_primary.to_string_lossy(),
        format!("primary={}", r.path),
        Some(serde_json::json!({ "path": r.path, "adjusted": r.adjusted })),
    ));

    // 2. foreign 非空 → -shell
    let foreign = sandbox.join("case-foreign").join(APP_DATA_BUNDLE_DIR);
    let _ = fs::remove_dir_all(foreign.parent().unwrap());
    fs::create_dir_all(&foreign).unwrap();
    fs::write(foreign.join("foreign.txt"), b"x").unwrap();
    let r = resolve_directory_slot(&foreign, is_our_app_data_dir, app_data_suffixes());
    let ok = r.adjusted
        && r.conflict_path.as_deref() == Some(foreign.to_string_lossy().as_ref())
        && r.path.ends_with("-shell");
    out.push(case(
        "app_data_foreign_suffix_shell",
        ok,
        format!("{} -> {}", foreign.display(), r.path),
        Some(serde_json::json!({
            "path": r.path,
            "adjusted": r.adjusted,
            "conflictPath": r.conflict_path,
        })),
    ));

    // 3. 本壳标记 → 复用
    let ours = sandbox.join("case-ours").join(APP_DATA_BUNDLE_DIR);
    let _ = fs::remove_dir_all(ours.parent().unwrap());
    fs::create_dir_all(&ours).unwrap();
    fs::write(ours.join("settings.json"), b"{}").unwrap();
    let r = resolve_directory_slot(&ours, is_our_app_data_dir, app_data_suffixes());
    out.push(case(
        "app_data_reuse_ours",
        !r.adjusted && r.path == ours.to_string_lossy(),
        format!("reuse {}", r.path),
        None,
    ));

    // 3b. 各壳标记文件均应识别为本壳
    for (marker, name) in [
        ("harness", "dir"),
        ("runtime", "dir"),
        ("logs", "dir"),
        (".harness.pid", "file"),
        (".runtime.lock", "file"),
    ] {
        let base = sandbox.join(format!("case-marker-{name}")).join(APP_DATA_BUNDLE_DIR);
        let _ = fs::remove_dir_all(base.parent().unwrap());
        fs::create_dir_all(&base).unwrap();
        if name == "dir" {
            fs::create_dir_all(base.join(marker)).unwrap();
        } else {
            fs::write(base.join(marker), b"x").unwrap();
        }
        let r = resolve_directory_slot(&base, is_our_app_data_dir, app_data_suffixes());
        out.push(case(
            &format!("app_data_reuse_marker_{marker}"),
            !r.adjusted && r.path == base.to_string_lossy(),
            format!("marker={marker} {}", r.path),
            None,
        ));
    }

    // 3c. 主路径 + -shell 均被 foreign 占用 → -desktop
    let chain = sandbox.join("case-chain").join(APP_DATA_BUNDLE_DIR);
    let chain_parent = chain.parent().unwrap();
    let _ = fs::remove_dir_all(chain_parent);
    fs::create_dir_all(&chain).unwrap();
    fs::write(chain.join("foreign.txt"), b"a").unwrap();
    fs::create_dir_all(chain_parent.join(format!("{APP_DATA_BUNDLE_DIR}-shell"))).unwrap();
    fs::write(
        chain_parent.join(format!("{APP_DATA_BUNDLE_DIR}-shell")).join("foreign.txt"),
        b"b",
    )
    .unwrap();
    let r = resolve_directory_slot(&chain, is_our_app_data_dir, app_data_suffixes());
    out.push(case(
        "app_data_suffix_chain_desktop",
        r.adjusted && r.path.ends_with("-desktop"),
        format!("{} -> {}", chain.display(), r.path),
        None,
    ));

    // 3d. 全部后缀槽位占满 → occupied
    let full = sandbox.join("case-full").join(APP_DATA_BUNDLE_DIR);
    let full_parent = full.parent().unwrap();
    let _ = fs::remove_dir_all(full_parent);
    fs::create_dir_all(&full).unwrap();
    fs::write(full.join("foreign.txt"), b"x").unwrap();
    for suffix in app_data_suffixes() {
        let alt = full_parent.join(format!("{APP_DATA_BUNDLE_DIR}{suffix}"));
        fs::create_dir_all(&alt).unwrap();
        fs::write(alt.join("foreign.txt"), b"x").unwrap();
    }
    let r = resolve_directory_slot(&full, is_our_app_data_dir, app_data_suffixes());
    out.push(case(
        "app_data_all_slots_occupied_emerg",
        r.occupied && r.adjusted && r.path.contains("-emerg-"),
        format!("occupied={} path={}", r.occupied, r.path),
        None,
    ));

    // 3e. 主路径是文件（非目录）→ 视为非空，应 suffix
    let file_slot = sandbox.join("case-file-slot").join(APP_DATA_BUNDLE_DIR);
    let file_parent = file_slot.parent().unwrap();
    let _ = fs::remove_dir_all(file_parent);
    fs::create_dir_all(file_parent).unwrap();
    fs::write(&file_slot, b"not-a-dir").unwrap();
    let r = resolve_directory_slot(&file_slot, is_our_app_data_dir, app_data_suffixes());
    out.push(case(
        "app_data_primary_is_file",
        r.adjusted && r.path.ends_with("-shell"),
        format!("file primary -> {}", r.path),
        None,
    ));

    // 4. hosted dsh-home foreign → -desktop
    let dsh_base = sandbox.join("case-dsh-home").join(HOSTED_DSH_HOME_DIR);
    let _ = fs::remove_dir_all(dsh_base.parent().unwrap());
    fs::create_dir_all(&dsh_base).unwrap();
    fs::write(dsh_base.join("foreign.txt"), b"x").unwrap();
    let r = resolve_directory_slot(&dsh_base, is_our_dsh_home, dsh_home_suffixes());
    out.push(case(
        "hosted_dsh_home_foreign_suffix",
        r.adjusted && r.path.ends_with("-desktop"),
        format!("{} -> {}", dsh_base.display(), r.path),
        None,
    ));

    // 4b. hosted dsh-home 有 settings.yaml → 复用
    let dsh_ours = sandbox.join("case-dsh-ours").join(HOSTED_DSH_HOME_DIR);
    let _ = fs::remove_dir_all(dsh_ours.parent().unwrap());
    fs::create_dir_all(&dsh_ours).unwrap();
    fs::write(dsh_ours.join("settings.yaml"), b"locale: zh\n").unwrap();
    let r = resolve_directory_slot(&dsh_ours, is_our_dsh_home, dsh_home_suffixes());
    out.push(case(
        "hosted_dsh_home_reuse_ours",
        !r.adjusted && r.path == dsh_ours.to_string_lossy(),
        format!("reuse {}", r.path),
        None,
    ));

    // 4c. hosted 显式路径 occupied（auto_adjust=false 语义）
    let explicit = sandbox.join("case-dsh-explicit").join(HOSTED_DSH_HOME_DIR);
    let _ = fs::remove_dir_all(explicit.parent().unwrap());
    fs::create_dir_all(&explicit).unwrap();
    fs::write(explicit.join("foreign.txt"), b"x").unwrap();
    let ev = paths::evaluate_hosted_dsh_home_slot(&explicit, false);
    out.push(case(
        "hosted_dsh_home_explicit_occupied",
        ev.occupied && !ev.adjusted,
        format!("occupied={}", ev.occupied),
        None,
    ));

    // 5. pathMeta JSON 往返
    let meta = PathMeta {
        app_data_dir: r.path.clone(),
        app_data_adjusted: true,
        app_data_conflict_path: Some(foreign.to_string_lossy().into_owned()),
        resolved_at: "0".into(),
    };
    let json = serde_json::to_string(&meta).unwrap();
    let back: PathMeta = serde_json::from_str(&json).unwrap();
    out.push(case(
        "path_meta_json_roundtrip",
        back.app_data_adjusted && back.app_data_conflict_path.is_some(),
        "PathMeta serde",
        Some(serde_json::from_str(&json).unwrap()),
    ));

    out
}

/// 设置审计 Roaming 根后调用真实 `resolve_app_data_dir_with_meta`（须在本进程首次 resolve 前）。
pub fn run_app_data_env_scenario(sandbox: &Path) -> PathAuditCase {
    let primary = sandbox.join(APP_DATA_BUNDLE_DIR);
    fs::create_dir_all(&primary).unwrap();
    fs::write(primary.join("foreign.txt"), b"block").unwrap();

    unsafe {
        std::env::set_var(paths::PATH_AUDIT_ROAMING_ENV, sandbox);
    }

    let r = paths::resolve_app_data_dir_with_meta();

    unsafe {
        std::env::remove_var(paths::PATH_AUDIT_ROAMING_ENV);
    }

    let ok = r.adjusted
        && r.path.contains("-shell")
        && r.conflict_path.as_deref() == Some(primary.to_string_lossy().as_ref());

    case(
        "app_data_roaming_root_resolve",
        ok,
        format!(
            "{}={} => {}",
            paths::PATH_AUDIT_ROAMING_ENV,
            sandbox.display(),
            r.path
        ),
        Some(serde_json::json!({
            "path": r.path,
            "adjusted": r.adjusted,
            "conflictPath": r.conflict_path,
        })),
    )
}

pub fn run_path_identity_disk_audit(include_env: bool) -> PathIdentityReport {
    let mut cases = Vec::new();

    // 环境变量场景须先于任何 resolve_app_data_dir（OnceLock）调用
    if include_env {
        let env_box = fresh_sandbox("env");
        cases.push(run_app_data_env_scenario(&env_box));
        teardown(&env_box);
    }

    let sandbox = fresh_sandbox("main");
    cases.extend(run_slot_scenarios(&sandbox));

    let ok = cases.iter().all(|c| c.ok);
    let report = PathIdentityReport {
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "0".into()),
        sandbox: sandbox.to_string_lossy().into_owned(),
        ok,
        cases,
    };
    teardown(&sandbox);
    report
}
