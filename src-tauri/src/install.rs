//! 下载并安装托管 Node + `@deepseek-ai/dsh`（仅壳 AppData，非 BYO）。

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{copy, Write};
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};
use zip::ZipArchive;

use crate::error::HostError;
use crate::net::http::http_client;
use crate::paths::{self, DSH_PACKAGE, NODE_DIST_NAME};
#[cfg(windows)]
use crate::platform;
use crate::progress;
use crate::runtime::{
    assert_harness_closure, is_harness_partial, resolve_dsh_entry,
};
use crate::settings::{self, ShellSettings};

/// 下载最大尝试次数（含首次）；失败退避 500ms → 1s → 2s…
const DOWNLOAD_MAX_ATTEMPTS: u32 = 3;

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    stage: &str,
    message: &str,
    percent: Option<u8>,
) {
    progress::emit_progress(app, stage, message, percent);
}

/// 若已存在可用 Node + dsh 入口则跳过；否则下载/安装。
pub async fn ensure_runtime_installed<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err(String::from(HostError::install("B2 仅支持 Windows x64")));
    }
    #[cfg(windows)]
    {
        ensure_node(app).await?;
        ensure_dsh(app).await?;
        Ok(())
    }
}

#[cfg(windows)]
async fn ensure_node<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let node = paths::node_binary(app)?;
    if paths::is_file(&node) {
        emit_progress(app, "detect", "已找到托管 Node", Some(20));
        return Ok(());
    }

    emit_progress(app, "download-node", "正在下载 Node.js…", Some(5));
    let runtime = paths::runtime_dir(app)?;
    fs::create_dir_all(&runtime)
        .map_err(|e| String::from(HostError::install(format!("mkdir runtime: {e}"))))?;

    let cfg = settings::load(app);
    let zip_path = runtime.join(format!("{NODE_DIST_NAME}.zip"));
    download_file(
        app,
        &cfg,
        &cfg.node_download_url(),
        &zip_path,
        "download-node",
    )
    .await?;

    emit_progress(app, "verify-node", "校验 Node 校验和…", Some(45));
    verify_node_sha256(app, &cfg, &zip_path).await?;

    emit_progress(app, "extract-node", "解压 Node…", Some(55));
    extract_zip(&zip_path, &runtime)?;
    let _ = fs::remove_file(&zip_path);

    if !paths::is_file(&node) {
        return Err(String::from(
            HostError::install(format!("解压后未找到 {}", node.display())),
        ));
    }
    emit_progress(app, "extract-node", "Node 就绪", Some(60));
    Ok(())
}

#[cfg(windows)]
async fn ensure_dsh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let entry = resolve_dsh_entry(app)?;
    if paths::is_file(&entry) {
        emit_progress(app, "detect", "已找到托管 harness", Some(70));
        return Ok(());
    }
    if is_harness_partial(app) {
        emit_progress(
            app,
            "install-dsh",
            "检测到不完整 harness（常见于中断的更新），正在修复安装…",
            Some(68),
        );
    }
    npm_install_dsh(app, false).await
}

/// 强制重装托管 harness（更新通道）；不因入口已存在而跳过。
#[cfg(windows)]
pub async fn force_install_dsh<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    ensure_node(app).await?;
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
    Err(String::from(HostError::install("B2 仅支持 Windows x64")))
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
            "update-dsh",
            &format!("正在备份旧 harness 包（尝试 {attempt}/6）…"),
            Some(30u8.saturating_add(attempt.saturating_mul(5))),
        );
        match fs::rename(&pkg, &bak) {
            Ok(()) => {
                emit_progress(app, "update-dsh", "旧 harness 包已备份", Some(55));
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
            "update-dsh",
            &format!("正在移除旧 harness 包（尝试 {attempt}/6）…"),
            Some(30u8.saturating_add(attempt.saturating_mul(5))),
        );
        match fs::remove_dir_all(&pkg) {
            Ok(()) => {
                emit_progress(app, "update-dsh", "旧 harness 包已移除", Some(55));
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
        "正在 npm install @deepseek-ai/dsh@latest（可能需数分钟，请稍候）…"
    } else {
        "正在 npm install @deepseek-ai/dsh（可能较久）…"
    };
    emit_progress(app, "install-dsh", msg, Some(75));

    let harness_for_cmd = harness.clone();
    let cfg = settings::load(app);
    let registry = cfg.npm_registry().to_string();
    let path_dir = node_dir_for_path(&node);
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
                progress::emit_progress(
                    &app_log,
                    "install-dsh",
                    &format!("npm install 进行中（已 {secs}s，可能需数分钟）…"),
                    Some(75),
                );
            } else {
                // 单次事件：写 shell.log + 推 UI（stage=npm-log，前端同步主文案）
                progress::emit_log_line(&app_log, "npm-log", line);
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

    // 闭包门禁（anywhere #339）：入口 + 声明的 @deepseek-ai/* 依赖目录
    assert_harness_closure(app)?;
    emit_progress(
        app,
        "install-dsh",
        if force {
            "harness 更新完成"
        } else {
            "harness 安装完成"
        },
        Some(90),
    );
    Ok(())
}

fn node_dir_for_path(node: &Path) -> PathBuf {
    node.parent().unwrap_or(Path::new(".")).to_path_buf()
}

async fn download_file<R: Runtime>(
    app: &AppHandle<R>,
    settings: &ShellSettings,
    url: &str,
    dest: &Path,
    stage: &str,
) -> Result<(), String> {
    let mut last_err = String::new();
    for attempt in 1..=DOWNLOAD_MAX_ATTEMPTS {
        match download_file_once(app, settings, url, dest, stage, attempt).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = e;
                if attempt < DOWNLOAD_MAX_ATTEMPTS {
                    let delay_ms = 500u64 * (1 << (attempt - 1));
                    emit_progress(
                        app,
                        stage,
                        &format!(
                            "下载失败，{delay_ms}ms 后重试（{attempt}/{DOWNLOAD_MAX_ATTEMPTS}）…"
                        ),
                        None,
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }
    Err(HostError::install(format!(
        "下载在 {DOWNLOAD_MAX_ATTEMPTS} 次尝试后仍失败 — {url}: {last_err}"
    ))
    .into())
}

/// 单次下载；若存在 `.partial` 则尝试 Range 续传。
async fn download_file_once<R: Runtime>(
    app: &AppHandle<R>,
    settings: &ShellSettings,
    url: &str,
    dest: &Path,
    stage: &str,
    attempt: u32,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| String::from(HostError::install(format!("mkdir: {e}"))))?;
    }
    let partial = dest.with_extension("partial");
    let existing = fs::metadata(&partial).ok().map(|m| m.len()).unwrap_or(0);

    let client = http_client(settings)?;
    let mut req = client.get(url);
    if existing > 0 {
        req = req.header("Range", format!("bytes={existing}-"));
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;

    let status = response.status();
    let resume = existing > 0 && status.as_u16() == 206;
    if !status.is_success() && !resume {
        // 服务端拒 Range：丢掉 partial 下轮全量（本轮也失败）
        if existing > 0 && status.as_u16() == 200 {
            let _ = fs::remove_file(&partial);
        }
        return Err(format!("HTTP {status}"));
    }
    // 200 且曾有 partial：服务端忽略 Range，从头写
    let start_at = if resume { existing } else { 0 };
    if !resume && existing > 0 {
        let _ = fs::remove_file(&partial);
    }

    let total = response
        .content_length()
        .map(|n| if resume { n + start_at } else { n });
    let mut stream = response.bytes_stream();
    let mut file = if resume {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&partial)
            .map_err(|e| format!("append partial: {e}"))?
    } else {
        File::create(&partial).map_err(|e| format!("create file: {e}"))?
    };
    let mut written: u64 = start_at;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读流: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("写文件: {e}"))?;
        written += chunk.len() as u64;
        if let Some(total) = total {
            if total > 0 {
                let pct = ((written as f64 / total as f64) * 40.0) as u8 + 5;
                let msg = if attempt > 1 {
                    format!("下载中 {written}/{total} 字节（尝试 {attempt}）")
                } else {
                    format!("下载中 {written}/{total} 字节")
                };
                emit_progress(app, stage, &msg, Some(pct.min(44)));
            }
        }
    }
    file.flush().map_err(|e| format!("flush: {e}"))?;
    drop(file);
    fs::rename(&partial, dest).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

async fn verify_node_sha256<R: Runtime>(
    app: &AppHandle<R>,
    settings: &ShellSettings,
    zip_path: &Path,
) -> Result<(), String> {
    let client = http_client(settings)?;
    let text = client
        .get(settings.node_shasums_url())
        .send()
        .await
        .map_err(|e| String::from(HostError::install(format!("拉取 SHASUMS: {e}"))))?
        .error_for_status()
        .map_err(|e| String::from(HostError::install(format!("SHASUMS HTTP: {e}"))))?
        .text()
        .await
        .map_err(|e| String::from(HostError::install(format!("SHASUMS body: {e}"))))?;

    let needle = format!("{NODE_DIST_NAME}.zip");
    let expected = text
        .lines()
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let name = parts.next()?;
            if name == needle || name.ends_with(&needle) {
                Some(hash.to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| String::from(HostError::install(format!("SHASUMS 中无 {needle}"))))?;

    let bytes = fs::read(zip_path)
        .map_err(|e| String::from(HostError::install(format!("读 zip: {e}"))))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual = hex::encode(hasher.finalize());
    if !actual.eq_ignore_ascii_case(&expected) {
        let _ = app;
        return Err(String::from(
            HostError::install(format!("SHA-256 不匹配 expected={expected} actual={actual}")),
        ));
    }
    Ok(())
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path)
        .map_err(|e| String::from(HostError::install(format!("open zip: {e}"))))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| String::from(HostError::install(format!("无效 zip: {e}"))))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| String::from(HostError::install(format!("zip entry: {e}"))))?;
        let outpath = match file.enclosed_name() {
            Some(path) => dest.join(path),
            None => continue,
        };
        if file.is_dir() {
            fs::create_dir_all(&outpath)
                .map_err(|e| String::from(HostError::install(format!("mkdir: {e}"))))?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| String::from(HostError::install(format!("mkdir: {e}"))))?;
            }
            let mut outfile = File::create(&outpath)
                .map_err(|e| String::from(HostError::install(format!("create: {e}"))))?;
            copy(&mut file, &mut outfile)
                .map_err(|e| String::from(HostError::install(format!("extract: {e}"))))?;
        }
    }
    Ok(())
}
