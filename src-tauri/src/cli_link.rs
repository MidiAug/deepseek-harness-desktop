//! CLI 集成：在 AppData/bin 写 dsh.cmd shim，并追加到用户 PATH（不改 shell rc）。

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::paths;
use crate::runtime::resolve_dsh_entry;
use crate::settings;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliLinkStatus {
    pub enabled: bool,
    pub shim_exists: bool,
    pub path_registered: bool,
    pub bin_dir: String,
    pub shim_path: String,
}

fn bin_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(paths::base_dir(app)?.join("bin"))
}

fn shim_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(bin_dir(app)?.join("dsh.cmd"))
}

pub fn status<R: Runtime>(app: &AppHandle<R>) -> CliLinkStatus {
    let cfg = settings::load(app);
    let bin = bin_dir(app).unwrap_or_else(|_| PathBuf::from(""));
    let shim = shim_path(app).unwrap_or_else(|_| PathBuf::from(""));
    let path_registered = bin_dir(app)
        .ok()
        .map(|d| user_path_contains(&d))
        .unwrap_or(false);
    CliLinkStatus {
        enabled: cfg.cli_link_enabled,
        shim_exists: shim.is_file(),
        path_registered,
        bin_dir: bin.to_string_lossy().into_owned(),
        shim_path: shim.to_string_lossy().into_owned(),
    }
}

pub fn ensure<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let bin = bin_dir(app)?;
    fs::create_dir_all(&bin).map_err(|e| format!("mkdir bin: {e}"))?;
    let node = paths::node_binary(app)?;
    let entry = resolve_dsh_entry(app)?;
    let shim = shim_path(app)?;
    // Windows cmd shim：不碰 .bashrc / .zshrc
    let body = format!(
        "@echo off\r\n\"{node}\" \"{entry}\" %*\r\n",
        node = node.display(),
        entry = entry.display()
    );
    fs::write(&shim, body).map_err(|e| format!("write shim: {e}"))?;
    register_user_path(&bin)?;
    Ok(())
}

pub fn remove<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Ok(shim) = shim_path(app) {
        let _ = fs::remove_file(shim);
    }
    if let Ok(bin) = bin_dir(app) {
        unregister_user_path(&bin)?;
    }
    Ok(())
}

fn user_path_contains(dir: &PathBuf) -> bool {
    #[cfg(windows)]
    {
        let dir_s = dir.to_string_lossy();
        let out = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "[Environment]::GetEnvironmentVariable('Path','User')",
            ])
            .output()
            .ok();
        let Some(o) = out else {
            return false;
        };
        let text = String::from_utf8_lossy(&o.stdout);
        text.split(';')
            .any(|p| p.eq_ignore_ascii_case(dir_s.as_ref()))
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        false
    }
}

fn register_user_path(dir: &PathBuf) -> Result<(), String> {
    #[cfg(windows)]
    {
        if user_path_contains(dir) {
            return Ok(());
        }
        let dir_s = dir.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$d='{dir_s}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if ([string]::IsNullOrEmpty($p)) {{ $n=$d }} else {{ $n=$p+';'+$d }}; [Environment]::SetEnvironmentVariable('Path',$n,'User')"
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status()
            .map_err(|e| format!("PATH register: {e}"))?;
        if !status.success() {
            return Err("PATH register failed".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        Err("CLI link 仅 Windows".into())
    }
}

fn unregister_user_path(dir: &PathBuf) -> Result<(), String> {
    #[cfg(windows)]
    {
        if !user_path_contains(dir) {
            return Ok(());
        }
        let dir_s = dir.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$d='{dir_s}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if ([string]::IsNullOrEmpty($p)) {{ return }}; $parts=@($p -split ';' | Where-Object {{ $_ -and $_.ToLower() -ne $d.ToLower() }}); [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'User')"
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status()
            .map_err(|e| format!("PATH unregister: {e}"))?;
        if !status.success() {
            return Err("PATH unregister failed".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = dir;
        Ok(())
    }
}
