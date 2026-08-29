//! 跨进程运行时锁：壳更新 / harness 更新 / reset / ensure 改盘路径互斥。
//! 死 pid 可抢占；活着则返回可读错误。

use std::fs;
use std::io::Write;

use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::paths;

/// 锁用途标签（写入文件第二行，便于诊断）。
#[derive(Debug, Clone, Copy)]
pub enum LockPurpose {
    ShellUpdate,
    HarnessUpdate,
    Reset,
    Ensure,
}

impl LockPurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ShellUpdate => "shell-update",
            Self::HarnessUpdate => "harness-update",
            Self::Reset => "reset",
            Self::Ensure => "ensure",
        }
    }
}

pub struct RuntimeLockGuard {
    path: std::path::PathBuf,
    owner_pid: u32,
}

impl Drop for RuntimeLockGuard {
    fn drop(&mut self) {
        // 仅删除自己持有的锁，避免误删后来者抢占后的文件。
        if let Ok(text) = fs::read_to_string(&self.path) {
            let first = text.lines().next().unwrap_or("");
            if first.trim() == self.owner_pid.to_string() {
                let _ = fs::remove_file(&self.path);
            }
        }
    }
}

/// 获取跨进程锁；失败返回可读 `HostError` 风格文案。
pub fn acquire<R: Runtime>(
    app: &AppHandle<R>,
    purpose: LockPurpose,
) -> Result<RuntimeLockGuard, String> {
    let path = paths::runtime_lock_file(app)?;
    acquire_at(path, purpose)
}

/// 按路径抢锁（测试与 `acquire` 共用；不依赖 `AppHandle`）。
pub fn acquire_at(
    path: std::path::PathBuf,
    purpose: LockPurpose,
) -> Result<RuntimeLockGuard, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| String::from(HostError::install(format!("mkdir lock: {e}"))))?;
    }

    let my_pid = std::process::id();

    if path.is_file() {
        let text = fs::read_to_string(&path).unwrap_or_default();
        let mut lines = text.lines();
        let holder = lines
            .next()
            .and_then(|s| s.trim().parse::<u32>().ok())
            .unwrap_or(0);
        let holder_purpose = lines.next().unwrap_or("unknown").trim().to_string();

        if holder != 0 && holder != my_pid && pid_alive(holder) {
            log::warn!(
                target: "shell::runtime",
                "runtime_lock busy holder={holder} purpose={holder_purpose} want={}",
                purpose.as_str()
            );
            return Err(String::from(
                HostError::install(format!(
                    "运行时忙（pid {holder} · {holder_purpose}）。请稍候或关闭其他 deepseek-harness-desktop 实例后再试。"
                )),
            ));
        }
        // 死进程或无效锁 → 抢占
        let _ = fs::remove_file(&path);
    }

    let mut f = fs::File::create(&path)
        .map_err(|e| String::from(HostError::install(format!("无法创建运行时锁: {e}"))))?;
    writeln!(f, "{my_pid}")
        .map_err(|e| String::from(HostError::install(format!("写运行时锁: {e}"))))?;
    writeln!(f, "{}", purpose.as_str())
        .map_err(|e| String::from(HostError::install(format!("写运行时锁: {e}"))))?;
    f.sync_all()
        .map_err(|e| String::from(HostError::install(format!("同步运行时锁: {e}"))))?;

    Ok(RuntimeLockGuard {
        path,
        owner_pid: my_pid,
    })
}

#[cfg(windows)]
fn pid_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    const STILL_ACTIVE: u32 = 259;
    // SAFETY: OpenProcess / GetExitCodeProcess 查存活；句柄用完即关。
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(handle, &mut code);
        let _ = CloseHandle(handle);
        ok != 0 && code == STILL_ACTIVE
    }
}

#[cfg(not(windows))]
fn pid_alive(pid: u32) -> bool {
    // 不引入 libc：`kill -0` 探测存活（macOS/Linux 开发态兜底）。
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_lock_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dsh-lock-test-{}-{}-{}",
            tag,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn purpose_labels() {
        assert_eq!(LockPurpose::ShellUpdate.as_str(), "shell-update");
        assert_eq!(LockPurpose::Ensure.as_str(), "ensure");
    }

    #[test]
    fn drop_removes_own_lock() {
        let dir = temp_lock_dir("drop");
        let path = dir.join(".runtime.lock");
        let pid = std::process::id();
        fs::write(&path, format!("{pid}\ntest\n")).unwrap();
        {
            let _g = RuntimeLockGuard {
                path: path.clone(),
                owner_pid: pid,
            };
        }
        assert!(!path.is_file());
        let _ = fs::remove_dir_all(&dir);
    }

    /// 故障注入：活着的持有者 → 后来者必须失败（INSTALL_FAILED 文案）。
    #[test]
    fn live_holder_blocks_acquire() {
        let dir = temp_lock_dir("live");
        let path = dir.join(".runtime.lock");

        // 真子进程作活持有者（勿用固定系统 PID：权限/查询在部分环境失败）。
        let mut child = {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                std::process::Command::new("powershell")
                    .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"])
                    .creation_flags(0x0800_0000)
                    .spawn()
                    .expect("spawn sleep fixture")
            }
            #[cfg(not(windows))]
            {
                std::process::Command::new("sleep")
                    .arg("60")
                    .spawn()
                    .expect("spawn sleep fixture")
            }
        };
        let foreign_alive = child.id();
        assert_ne!(foreign_alive, std::process::id());
        assert!(
            pid_alive(foreign_alive),
            "fixture child pid {foreign_alive} must be alive"
        );
        fs::write(&path, format!("{foreign_alive}\nensure\n")).unwrap();

        let err = match acquire_at(path.clone(), LockPurpose::Reset) {
            Err(e) => e,
            Ok(_g) => {
                let _ = child.kill();
                let _ = child.wait();
                panic!("expected live holder to block acquire");
            }
        };
        assert!(
            err.starts_with("INSTALL_FAILED:"),
            "expected INSTALL_FAILED prefix, got {err}"
        );
        assert!(err.contains("运行时忙"), "expected busy message, got {err}");
        assert!(path.is_file(), "failed acquire must not delete live holder lock");
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_dir_all(&dir);
    }

    /// 故障注入：死 pid / 无效锁 → 可抢占。
    #[test]
    fn dead_holder_is_preempted() {
        let dir = temp_lock_dir("dead");
        let path = dir.join(".runtime.lock");
        // 极大 pid：几乎不可能存活
        fs::write(&path, "2147483646\nensure\n").unwrap();
        assert!(!pid_alive(2147483646));

        let guard = acquire_at(path.clone(), LockPurpose::Ensure).unwrap();
        assert!(path.is_file());
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.starts_with(&format!("{}\n", std::process::id())));
        drop(guard);
        assert!(!path.is_file());
        let _ = fs::remove_dir_all(&dir);
    }
}
