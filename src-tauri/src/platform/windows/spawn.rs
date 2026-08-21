//! Windows：隐藏控制台 spawn，并保留进程 HANDLE 以防 PID 复用误杀。
//!
//! GUI 宿主若用 `CREATE_NO_WINDOW` 启 node，孙进程会各自弹可见控制台。
//! 改用 `CREATE_NEW_CONSOLE` + `SW_HIDE`，让 node 与后代共享隐藏控制台。

use std::collections::HashMap;
use std::ffi::OsString;
use std::fs::File;
use std::io::{self, BufReader, Read};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::{FromRawHandle, RawHandle};
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    CloseHandle, SetHandleInformation, GENERIC_READ, GENERIC_WRITE, HANDLE, HANDLE_FLAG_INHERIT,
    INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
    CreateProcessW, GetExitCodeProcess, GetProcessId, WaitForSingleObject, CREATE_NEW_CONSOLE,
    CREATE_UNICODE_ENVIRONMENT, INFINITE, PROCESS_INFORMATION, STARTF_USESHOWWINDOW,
    STARTF_USESTDHANDLES, STARTUPINFOW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;

/// 本壳持有的进程句柄；Drop 时 CloseHandle。
pub struct OwnedProcessHandle {
    handle: HANDLE,
    pid: u32,
}

// HANDLE 在 Windows 上是指针，跨线程传给 Mutex 需显式标记。
unsafe impl Send for OwnedProcessHandle {}

impl OwnedProcessHandle {
    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// 句柄仍对应存活进程（Wait 超时 = 未退出）。
    pub fn is_running(&self) -> bool {
        if self.handle.is_null() || self.handle == INVALID_HANDLE_VALUE {
            return false;
        }
        unsafe { WaitForSingleObject(self.handle, 0) == WAIT_TIMEOUT }
    }

    pub fn wait_exit_code(&self) -> io::Result<u32> {
        unsafe {
            let wait = WaitForSingleObject(self.handle, INFINITE);
            if wait != WAIT_OBJECT_0 {
                return Err(io::Error::last_os_error());
            }
            let mut code: u32 = 1;
            if GetExitCodeProcess(self.handle, &mut code) == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(code)
        }
    }
}

impl Drop for OwnedProcessHandle {
    fn drop(&mut self) {
        if !self.handle.is_null() && self.handle != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.handle);
            }
            self.handle = std::ptr::null_mut();
        }
    }
}

pub struct OwnedProcess {
    pub pid: u32,
    pub stdout: File,
    pub stderr: File,
    pub handle: OwnedProcessHandle,
}

/// 启动并持有 HANDLE（长期运行的 dsh web）。
pub fn spawn_owned(
    program: &Path,
    args: &[OsString],
    current_dir: Option<&Path>,
    envs: &HashMap<String, String>,
) -> io::Result<OwnedProcess> {
    let (stdout, stderr, handle) = spawn_tracked(program, args, current_dir, envs)?;
    let pid = unsafe { GetProcessId(handle) };
    if pid == 0 {
        unsafe {
            CloseHandle(handle);
        }
        return Err(io::Error::last_os_error());
    }
    Ok(OwnedProcess {
        pid,
        stdout,
        stderr,
        handle: OwnedProcessHandle { handle, pid },
    })
}

/// 启动、等到退出，返回退出码与 stdout/stderr 文本（无行回调时的便捷封装）。
#[cfg(test)]
pub fn spawn_and_wait(
    program: &Path,
    args: &[OsString],
    current_dir: Option<&Path>,
    envs: &HashMap<String, String>,
) -> io::Result<(u32, String, String)> {
    spawn_and_wait_streaming(program, args, current_dir, envs, |_| {})
}

/// 边跑边按行回调（stdout/stderr；约 5s 无输出发心跳，含已耗时）。
/// npm 进度常用 `\r` 刷新，故按 `\n`/`\r` 切段，避免整段静默。
pub fn spawn_and_wait_streaming<F>(
    program: &Path,
    args: &[OsString],
    current_dir: Option<&Path>,
    envs: &HashMap<String, String>,
    mut on_line: F,
) -> io::Result<(u32, String, String)>
where
    F: FnMut(&str),
{
    let OwnedProcess {
        stdout,
        stderr,
        handle,
        ..
    } = spawn_owned(program, args, current_dir, envs)?;

    let (tx, rx) = mpsc::channel::<String>();
    let tx_out = tx.clone();
    let t_out = thread::spawn(move || {
        let mut acc = String::new();
        read_stream_chunks(stdout, &mut acc, &tx_out);
        acc
    });
    let tx_err = tx.clone();
    let t_err = thread::spawn(move || {
        let mut acc = String::new();
        read_stream_chunks(stderr, &mut acc, &tx_err);
        acc
    });
    drop(tx);

    let waiter = thread::spawn(move || handle.wait_exit_code());
    let started = Instant::now();
    let mut last_activity = Instant::now();
    let heartbeat = Duration::from_secs(5);

    loop {
        let readers_done = t_out.is_finished() && t_err.is_finished();
        let wait_done = waiter.is_finished();
        match rx.recv_timeout(Duration::from_millis(400)) {
            Ok(line) => {
                last_activity = Instant::now();
                on_line(&line);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !wait_done && last_activity.elapsed() >= heartbeat {
                    let secs = started.elapsed().as_secs();
                    on_line(&format!("…仍在执行（已 {secs}s），请稍候"));
                    last_activity = Instant::now();
                }
                if wait_done && readers_done {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    while let Ok(line) = rx.try_recv() {
        on_line(&line);
    }

    let code = waiter
        .join()
        .map_err(|_| io::Error::other("wait join failed"))??;
    let out = t_out.join().unwrap_or_default();
    let err = t_err.join().unwrap_or_default();
    Ok((code, out, err))
}

/// 按 `\n` / `\r` 切段推送（兼容 npm 回车刷新进度）。
fn read_stream_chunks(file: File, acc: &mut String, tx: &mpsc::Sender<String>) {
    let mut reader = BufReader::new(file);
    let mut pending: Vec<u8> = Vec::new();
    let mut buf = [0u8; 2048];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                flush_chunk(&mut pending, acc, tx);
                break;
            }
            Ok(n) => {
                for &b in &buf[..n] {
                    if b == b'\n' || b == b'\r' {
                        flush_chunk(&mut pending, acc, tx);
                    } else {
                        pending.push(b);
                        // 防止极端无分隔的超长缓冲占满内存
                        if pending.len() >= 512 {
                            flush_chunk(&mut pending, acc, tx);
                        }
                    }
                }
            }
            Err(_) => {
                flush_chunk(&mut pending, acc, tx);
                break;
            }
        }
    }
}

fn flush_chunk(pending: &mut Vec<u8>, acc: &mut String, tx: &mpsc::Sender<String>) {
    if pending.is_empty() {
        return;
    }
    let line = String::from_utf8_lossy(pending).trim().to_string();
    pending.clear();
    if line.is_empty() {
        return;
    }
    acc.push_str(&line);
    acc.push('\n');
    let _ = tx.send(line);
}

fn spawn_tracked(
    program: &Path,
    args: &[OsString],
    current_dir: Option<&Path>,
    envs: &HashMap<String, String>,
) -> io::Result<(File, File, HANDLE)> {
    unsafe {
        let pipe_attrs = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: std::ptr::null_mut(),
            bInheritHandle: 1,
        };

        let mut stdout_read: HANDLE = std::ptr::null_mut();
        let mut stdout_write: HANDLE = std::ptr::null_mut();
        if CreatePipe(&mut stdout_read, &mut stdout_write, &pipe_attrs, 0) == 0 {
            return Err(io::Error::last_os_error());
        }

        let mut stderr_read: HANDLE = std::ptr::null_mut();
        let mut stderr_write: HANDLE = std::ptr::null_mut();
        if CreatePipe(&mut stderr_read, &mut stderr_write, &pipe_attrs, 0) == 0 {
            CloseHandle(stdout_read);
            CloseHandle(stdout_write);
            return Err(io::Error::last_os_error());
        }

        SetHandleInformation(stdout_read, HANDLE_FLAG_INHERIT, 0);
        SetHandleInformation(stderr_read, HANDLE_FLAG_INHERIT, 0);

        let mut nul = "NUL".encode_utf16().collect::<Vec<u16>>();
        nul.push(0);
        let stdin_handle = CreateFileW(
            nul.as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );
        if stdin_handle == INVALID_HANDLE_VALUE {
            CloseHandle(stdout_read);
            CloseHandle(stdout_write);
            CloseHandle(stderr_read);
            CloseHandle(stderr_write);
            return Err(io::Error::last_os_error());
        }
        SetHandleInformation(stdin_handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT);

        let mut command_line = build_command_line(program, args);
        let env_block = build_env_block(envs);

        let mut application_name = program.as_os_str().encode_wide().collect::<Vec<u16>>();
        application_name.push(0);

        let mut current_dir_wide: Option<Vec<u16>> = None;
        if let Some(dir) = current_dir {
            let mut wide = dir.as_os_str().encode_wide().collect::<Vec<u16>>();
            wide.push(0);
            current_dir_wide = Some(wide);
        }

        let startup_info = STARTUPINFOW {
            cb: std::mem::size_of::<STARTUPINFOW>() as u32,
            dwFlags: STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES,
            wShowWindow: SW_HIDE as u16,
            hStdInput: stdin_handle,
            hStdOutput: stdout_write,
            hStdError: stderr_write,
            ..Default::default()
        };

        let mut process_info = PROCESS_INFORMATION::default();

        let created = CreateProcessW(
            application_name.as_ptr(),
            command_line.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
            CREATE_NEW_CONSOLE | CREATE_UNICODE_ENVIRONMENT,
            env_block.as_ptr() as *const core::ffi::c_void,
            current_dir_wide
                .as_ref()
                .map(|wide| wide.as_ptr())
                .unwrap_or(std::ptr::null()),
            &startup_info,
            &mut process_info,
        );

        CloseHandle(stdout_write);
        CloseHandle(stderr_write);
        CloseHandle(stdin_handle);

        if created == 0 {
            CloseHandle(stdout_read);
            CloseHandle(stderr_read);
            return Err(io::Error::last_os_error());
        }

        CloseHandle(process_info.hThread);

        let stdout = File::from_raw_handle(stdout_read as RawHandle);
        let stderr = File::from_raw_handle(stderr_read as RawHandle);
        Ok((stdout, stderr, process_info.hProcess))
    }
}

/// 空值表示从环境块中删除该键（对齐 apply_proxy_env 的 remove）。
fn build_env_block(extra: &HashMap<String, String>) -> Vec<u16> {
    let mut vars: Vec<(OsString, OsString)> = std::env::vars_os().collect();
    for (key, value) in extra {
        let key_os = OsString::from(key);
        if value.is_empty() {
            vars.retain(|(existing, _)| !existing.eq_ignore_ascii_case(&key_os));
            continue;
        }
        if let Some(entry) = vars
            .iter_mut()
            .find(|(existing, _)| existing.eq_ignore_ascii_case(&key_os))
        {
            entry.1 = OsString::from(value);
        } else {
            vars.push((key_os, OsString::from(value)));
        }
    }

    let mut block = Vec::new();
    for (key, value) in vars {
        block.extend(key.encode_wide());
        block.push(b'=' as u16);
        block.extend(value.encode_wide());
        block.push(0);
    }
    block.push(0);
    block
}

fn build_command_line(program: &Path, args: &[OsString]) -> Vec<u16> {
    let mut command = quote_arg(&program.as_os_str().to_string_lossy());
    for arg in args {
        command.push(' ');
        command.push_str(&quote_arg(&arg.to_string_lossy()));
    }
    let mut wide = command.encode_utf16().collect::<Vec<u16>>();
    wide.push(0);
    wide
}

fn quote_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.chars().any(|c| matches!(c, ' ' | '\t' | '"')) {
        return arg.to_string();
    }

    let mut out = String::from("\"");
    let mut backslashes = 0usize;
    for c in arg.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                for _ in 0..backslashes * 2 {
                    out.push('\\');
                }
                backslashes = 0;
                out.push('\\');
                out.push('"');
            }
            _ => {
                for _ in 0..backslashes {
                    out.push('\\');
                }
                backslashes = 0;
                out.push(c);
            }
        }
    }
    for _ in 0..backslashes * 2 {
        out.push('\\');
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_key_match_is_case_insensitive() {
        let mut vars: Vec<(OsString, OsString)> = vec![
            (OsString::from("Path"), OsString::from("OLD")),
            (OsString::from("DSH_HOME"), OsString::from("x")),
        ];
        let key = OsString::from("PATH");
        if let Some(entry) = vars
            .iter_mut()
            .find(|(existing, _)| existing.eq_ignore_ascii_case(&key))
        {
            entry.1 = OsString::from("NEW");
        }
        let path_entries: Vec<String> = vars
            .iter()
            .filter(|(k, _)| k.to_string_lossy().eq_ignore_ascii_case("path"))
            .map(|(_, v)| v.to_string_lossy().into_owned())
            .collect();
        assert_eq!(path_entries.len(), 1);
        assert_eq!(path_entries[0], "NEW");
    }

    #[test]
    fn spawn_captures_stdout() {
        let mut envs = HashMap::new();
        envs.insert("DSH_WIN_SPAWN_TEST".to_string(), "hello-r1".to_string());
        let args = vec![
            OsString::from("/d"),
            OsString::from("/c"),
            OsString::from("echo %DSH_WIN_SPAWN_TEST%"),
        ];
        let (code, out, _err) = spawn_and_wait(
            Path::new("C:\\Windows\\System32\\cmd.exe"),
            &args,
            None,
            &envs,
        )
        .unwrap();
        assert_eq!(code, 0);
        assert!(out.contains("hello-r1"), "stdout: {out:?}");
    }
}
