use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::paths::{self, DSH_PACKAGE};
use crate::platform;
use crate::progress::{self, InstallStage};
use crate::runtime::package::{
    assert_harness_closure, is_harness_partial, resolve_dsh_entry,
};
use crate::settings;

use super::emit_progress;
use super::node;

#[cfg(windows)]
pub(super) async fn ensure_dsh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let entry = resolve_dsh_entry(app)?;
    if paths::is_file(&entry) {
        emit_progress(app, InstallStage::Detect, "已找到托管 harness", Some(70));
        return Ok(());
    }
    if is_harness_partial(app) {
        emit_progress(
            app,
            InstallStage::InstallDsh,
            "检测到不完整 harness（常见于中断的更新），正在修复安装…",
            Some(68),
        );
    }
    npm_install_dsh(app, false).await
}

/// 强制重装托管 harness（更新通道）；不因入口已存在而跳过。
#[cfg(windows)]
pub async fn force_install_dsh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    node::ensure_node(app).await?;
    // 先备份挪走旧包（而非直接删）：中断时仍可能留下可回滚痕迹；装成功再清备份。
    let backup = stash_installed_dsh_package(app).await?;
    match npm_install_dsh(app, true).await {
        Ok(()) => {
            if let Some(bak) = backup {
                let _ = fs::remove_dir_all(&bak);
            }
            Ok(())
        }
        Err(e) => {
            if let Some(bak) = backup {
                let _ = restore_stashed_dsh_package(app, &bak);
            }
            Err(e)
        }
    }
}

#[cfg(not(windows))]
pub async fn force_install_dsh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let _ = app;
    Err(String::from(HostError::install("当前仅支持 Windows x64")))
}

/// 将 `node_modules/@deepseek-ai/dsh` 改名为旁路备份，避免更新中途退出后无入口。
#[cfg(windows)]
async fn stash_installed_dsh_package<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<std::path::PathBuf>, String> {
    let pkg = paths::harness_dir(app)?
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh");
    if !pkg.exists() {
        return Ok(None);
    }
    let bak = pkg.with_file_name("dsh.__bak");
    if bak.exists() {
        let _ = fs::remove_dir_all(&bak);
    }
    for attempt in 1u8..=6 {
        emit_progress(
            app,
            InstallStage::UpdateDsh,
            &format!("正在备份旧 harness 包（尝试 {attempt}/6）…"),
            Some(30u8.saturating_add(attempt.saturating_mul(5))),
        );
        match fs::rename(&pkg, &bak) {
            Ok(()) => {
                emit_progress(app, InstallStage::UpdateDsh, "旧 harness 包已备份", Some(55));
                return Ok(Some(bak));
            }
            Err(e) => {
                if attempt == 6 {
                    // 回退为删除（与旧行为一致），避免永久卡在文件锁
                    return remove_installed_dsh_package(app)
                        .await
                        .map(|_| None)
                        .map_err(|err| format!("{err}（rename 亦失败: {e})"));
                }
                tokio::time::sleep(std::time::Duration::from_millis(400 * u64::from(attempt)))
                    .await;
            }
        }
    }
    Ok(None)
}

#[cfg(windows)]
fn restore_stashed_dsh_package<R: Runtime>(
    app: &AppHandle<R>,
    bak: &std::path::Path,
) -> Result<(), String> {
    let pkg = paths::harness_dir(app)?
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh");
    if pkg.exists() {
        let _ = fs::remove_dir_all(&pkg);
    }
    fs::rename(bak, &pkg).map_err(|e| {
        String::from(HostError::install(format!("回滚旧 harness 失败: {e}")))
    })
}

/// 删除 `node_modules/@deepseek-ai/dsh`，带短重试（文件锁）。
#[cfg(windows)]
async fn remove_installed_dsh_package<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let pkg = paths::harness_dir(app)?
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh");
    if !pkg.exists() {
        return Ok(());
    }
    for attempt in 1u8..=6 {
        emit_progress(
            app,
            InstallStage::UpdateDsh,
            &format!("正在移除旧 harness 包（尝试 {attempt}/6）…"),
            Some(30u8.saturating_add(attempt.saturating_mul(5))),
        );
        match fs::remove_dir_all(&pkg) {
            Ok(()) => {
                emit_progress(app, InstallStage::UpdateDsh, "旧 harness 包已移除", Some(55));
                return Ok(());
            }
            Err(e) => {
                if attempt == 6 {
                    return Err(String::from(
                        HostError::install(format!(
                            "无法删除旧 harness 包 {}: {e}",
                            pkg.display()
                        )),
                    ));
                }
                tokio::time::sleep(std::time::Duration::from_millis(400 * u64::from(attempt)))
                    .await;
            }
        }
    }
    Ok(())
}

/// 执行 `npm install @deepseek-ai/dsh@latest`；`force` 仅影响进度文案。
#[cfg(windows)]
async fn npm_install_dsh<R: Runtime>(app: &AppHandle<R>, force: bool) -> Result<(), String> {
    let harness = paths::harness_dir(app)?;
    fs::create_dir_all(&harness)
        .map_err(|e| String::from(HostError::install(format!("mkdir harness: {e}"))))?;

    let node = paths::node_binary(app)?;
    let npm_cli = paths::npm_cli_js(app)?;
    if !paths::is_file(&npm_cli) {
        return Err(String::from(
            HostError::node_missing(format!("未找到 npm-cli.js（{})", npm_cli.display())),
        ));
    }

    let msg = if force {
        "正在 npm install @deepseek-ai/dsh@latest（首次常需十余分钟）…"
    } else {
        "正在 npm install @deepseek-ai/dsh（首次常需十余分钟）…"
    };
    emit_progress(app, InstallStage::InstallDsh, msg, Some(75));

    let harness_for_cmd = harness.clone();
    let cfg = settings::load(app);
    let registry = cfg.npm_registry().to_string();
    let path_dir = node::node_dir_for_path(&node);
    let package_arg = format!("{DSH_PACKAGE}@latest");
    progress::append_shell_log(
        app,
        &format!("npm_install_dsh force={force} registry={registry} arg={package_arg}"),
    );
    // 镜像/代理来自设置；IPv4 优先避免 Node 默 IPv6 卡住；行级流式进度。
    let app_log = app.clone();
    let output = tokio::task::spawn_blocking(move || {
        let mut envs = settings::proxy_env_overrides(&cfg);
        envs.insert(
            "PATH".into(),
            path_dir.to_string_lossy().into_owned(),
        );
        envs.insert("NODE_OPTIONS".into(), "--dns-result-order=ipv4first".into());
        envs.insert("npm_config_fetch_timeout".into(), "300000".into());
        envs.insert("npm_config_fetch_retries".into(), "5".into());
        // 非 TTY 下默认几乎无输出；打开进度与 info，便于 UI 流式展示
        envs.insert("npm_config_progress".into(), "true".into());
        envs.insert("npm_config_loglevel".into(), "info".into());

        let args = vec![
            OsString::from(npm_cli.as_os_str()),
            OsString::from("install"),
            OsString::from(&package_arg),
            OsString::from("--prefix"),
            OsString::from(harness_for_cmd.as_os_str()),
            OsString::from("--registry"),
            OsString::from(&registry),
            OsString::from("--no-fund"),
            OsString::from("--no-audit"),
            OsString::from("--loglevel"),
            OsString::from("info"),
        ];
        let started = std::time::Instant::now();
        platform::spawn_and_wait_streaming(&node, &args, Some(&harness_for_cmd), &envs, |line| {
            if line.starts_with('…') || line.starts_with("...") {
                let secs = started.elapsed().as_secs();
                let hint = npm_elapsed_hint(secs);
                progress::emit_progress(
                    &app_log,
                    InstallStage::InstallDsh,
                    &format!("npm install 进行中（已 {secs}s，{hint}）…"),
                    Some(75),
                );
            } else {
                // 单次事件：写 shell.log + 推 UI（stage=npm-log，前端同步主文案）
                progress::emit_log_line(&app_log, InstallStage::NpmLog, line);
            }
        })
    })
    .await
    .map_err(|e| String::from(HostError::install(format!("join npm: {e}"))))?
    .map_err(|e| String::from(HostError::install(format!("spawn npm: {e}"))))?;

    let (code, stdout, stderr) = output;
    progress::append_shell_log(
        app,
        &format!(
            "npm_install_dsh done code={code} stdout_len={} stderr_len={}",
            stdout.len(),
            stderr.len()
        ),
    );
    if code != 0 {
        progress::append_shell_log(
            app,
            &format!("npm_install_dsh FAIL stderr=\n{stderr}\nstdout=\n{stdout}"),
        );
        return Err(String::from(
            HostError::install(format!("npm install 失败\n{stderr}\n{stdout}")),
        ));
    }

    // 闭包门禁：入口 + 声明的 @deepseek-ai/* 依赖目录
    assert_harness_closure(app)?;
    emit_progress(
        app,
        InstallStage::InstallDsh,
        if force {
            "harness 更新完成"
        } else {
            "harness 安装完成"
        },
        Some(90),
    );
    Ok(())
}

/// 本机全局 npm 重装 `@deepseek-ai/dsh@latest`（系统运行时 / 首跑「本机已安装」）。
#[cfg(windows)]
pub async fn npm_install_dsh_global<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    use crate::system_runtime;

    let rt = system_runtime::resolve_system_runtime().ok_or_else(|| {
        String::from(HostError::install(
            "未检测到本机 Node / npm，无法重装 dsh。请先安装官方 CLI 或改用应用内安装。",
        ))
    })?;
    let node = rt.node;
    let npm_cli = system_npm_cli_js(&node).ok_or_else(|| {
        String::from(HostError::install(format!(
            "未找到 npm-cli.js（与 {} 同前缀）",
            node.display()
        )))
    })?;

    emit_progress(
        app,
        InstallStage::InstallDsh,
        "正在 npm 全局重装 @deepseek-ai/dsh@latest（可能需数分钟）…",
        Some(75),
    );

    let cfg = settings::load(app);
    let registry = cfg.npm_registry().to_string();
    let package_arg = format!("{DSH_PACKAGE}@latest");
    progress::append_shell_log(
        app,
        &format!("npm_install_dsh_global registry={registry} arg={package_arg}"),
    );

    let app_log = app.clone();
    let node_dir = node::node_dir_for_path(&node);
    let user_path = std::env::var("PATH").unwrap_or_default();
    let output = tokio::task::spawn_blocking(move || {
        let mut envs = settings::proxy_env_overrides(&cfg);
        envs.insert(
            "PATH".into(),
            format!("{};{user_path}", node_dir.to_string_lossy()),
        );
        envs.insert("NODE_OPTIONS".into(), "--dns-result-order=ipv4first".into());
        envs.insert("npm_config_fetch_timeout".into(), "300000".into());
        envs.insert("npm_config_fetch_retries".into(), "5".into());
        envs.insert("npm_config_progress".into(), "true".into());
        envs.insert("npm_config_loglevel".into(), "info".into());

        let args = vec![
            OsString::from(npm_cli.as_os_str()),
            OsString::from("install"),
            OsString::from("-g"),
            OsString::from(&package_arg),
            OsString::from("--registry"),
            OsString::from(&registry),
            OsString::from("--no-fund"),
            OsString::from("--no-audit"),
            OsString::from("--loglevel"),
            OsString::from("info"),
        ];
        let started = std::time::Instant::now();
        platform::spawn_and_wait_streaming(&node, &args, None, &envs, |line| {
            if line.starts_with('…') || line.starts_with("...") {
                let secs = started.elapsed().as_secs();
                let hint = npm_elapsed_hint(secs);
                progress::emit_progress(
                    &app_log,
                    InstallStage::InstallDsh,
                    &format!("npm 全局安装进行中（已 {secs}s，{hint}）…"),
                    Some(75),
                );
            } else {
                progress::emit_log_line(&app_log, InstallStage::NpmLog, line);
            }
        })
    })
    .await
    .map_err(|e| String::from(HostError::install(format!("join npm global: {e}"))))?
    .map_err(|e| String::from(HostError::install(format!("spawn npm global: {e}"))))?;

    let (code, stdout, stderr) = output;
    progress::append_shell_log(
        app,
        &format!(
            "npm_install_dsh_global done code={code} stdout_len={} stderr_len={}",
            stdout.len(),
            stderr.len()
        ),
    );
    if code != 0 {
        return Err(String::from(
            HostError::install(format!("npm 全局安装失败\n{stderr}\n{stdout}")),
        ));
    }
    if system_runtime::resolve_system_runtime().is_none() {
        return Err(String::from(HostError::install(
            "npm 安装完成但未检测到可用的本机 dsh 入口",
        )));
    }
    emit_progress(app, InstallStage::InstallDsh, "本机 dsh 重装完成", Some(90));
    Ok(())
}

/// 心跳文案：避免永远「数分钟」造成假死感。
#[cfg(windows)]
fn npm_elapsed_hint(secs: u64) -> &'static str {
    if secs < 180 {
        "通常需数分钟"
    } else if secs < 600 {
        "依赖较多，常需十余分钟"
    } else if secs < 1200 {
        "仍在拉取/解压，请继续等待"
    } else {
        "已超过 20 分钟：可展开日志确认是否仍有 http fetch"
    }
}

#[cfg(windows)]
fn system_npm_cli_js(node: &Path) -> Option<PathBuf> {
    let npm_root = node.parent()?;
    let cli = npm_root
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js");
    cli.is_file().then_some(cli)
}
