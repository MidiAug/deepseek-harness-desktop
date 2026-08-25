use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};
use zip::ZipArchive;

use crate::error::HostError;
use crate::net::http::http_client;
use crate::paths::{self, NODE_DIST_NAME};
use crate::progress::InstallStage;
use crate::settings::ShellSettings;

use super::emit_progress;

/// 下载最大尝试次数（含首次）；失败退避 500ms → 1s → 2s…
const DOWNLOAD_MAX_ATTEMPTS: u32 = 3;

#[cfg(windows)]
pub(super) async fn ensure_node<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let node = paths::node_binary(app)?;
    if paths::is_file(&node) {
        emit_progress(app, InstallStage::Detect, "已找到托管 Node", Some(20));
        return Ok(());
    }

    emit_progress(app, InstallStage::DownloadNode, "正在下载 Node.js…", Some(5));
    let runtime = paths::runtime_dir(app)?;
    fs::create_dir_all(&runtime)
        .map_err(|e| String::from(HostError::install(format!("mkdir runtime: {e}"))))?;

    let cfg = crate::settings::load(app);
    let zip_path = runtime.join(format!("{NODE_DIST_NAME}.zip"));
    download_file(
        app,
        &cfg,
        &cfg.node_download_url(),
        &zip_path,
        InstallStage::DownloadNode,
    )
    .await?;

    emit_progress(app, InstallStage::VerifyNode, "校验 Node 校验和…", Some(45));
    verify_node_sha256(app, &cfg, &zip_path).await?;

    emit_progress(app, InstallStage::ExtractNode, "解压 Node…", Some(55));
    extract_zip(&zip_path, &runtime)?;
    let _ = fs::remove_file(&zip_path);

    if !paths::is_file(&node) {
        return Err(String::from(
            HostError::install(format!("解压后未找到 {}", node.display())),
        ));
    }
    emit_progress(app, InstallStage::ExtractNode, "Node 就绪", Some(60));
    Ok(())
}

pub(super) fn node_dir_for_path(node: &Path) -> PathBuf {
    node.parent().unwrap_or(Path::new(".")).to_path_buf()
}

async fn download_file<R: Runtime>(
    app: &AppHandle<R>,
    settings: &ShellSettings,
    url: &str,
    dest: &Path,
    stage: InstallStage,
) -> Result<(), String> {
    let mut last_err = String::new();
    for attempt in 1..=DOWNLOAD_MAX_ATTEMPTS {
        match download_file_once(app, settings, url, dest, stage, attempt).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = e;
                if attempt < DOWNLOAD_MAX_ATTEMPTS {
                    let delay_ms = 500u64 * (1 << (attempt - 1));
                    log::warn!(
                        target: "shell::install",
                        "download retry {attempt}/{DOWNLOAD_MAX_ATTEMPTS} url={url} err={last_err}"
                    );
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
    stage: InstallStage,
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
    use std::io::copy;

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
