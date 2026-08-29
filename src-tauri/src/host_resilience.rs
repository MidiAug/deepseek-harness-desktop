//! 宿主韧性可测内核（B67）：与 AppHandle 解耦，供故障注入矩阵驱动。
//!
//! 生产路径经 `supervise` / `runtime::package` 调用；测试直接注入假端口/假进程/假树。

use std::fs;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::Path;
use std::time::Duration;

use crate::error::HostError;

/// 孤儿 pid 文件清扫决策（不执行 kill）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SweepDecision {
    /// 端口空闲 → 只删脏 pid 文件
    ClearStaleFile,
    /// 端口仍由记录 pid 占用 → 杀树并清文件
    KillOwner { pid: u32, port: u16 },
    /// 端口被别人占，或记录无效 → 不动进程
    LeaveAlone,
}

/// 根据「端口是否在用 + 谁占用」决定 sweep 行为。
pub fn decide_orphan_sweep(
    pid: u32,
    port: u16,
    port_in_use: bool,
    owner_pid: Option<u32>,
) -> SweepDecision {
    if !port_in_use {
        return SweepDecision::ClearStaleFile;
    }
    if owner_pid == Some(pid) {
        return SweepDecision::KillOwner { pid, port };
    }
    SweepDecision::LeaveAlone
}

/// 等待环失败原因（上层映射到 HostError 前缀）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WaitFail {
    Timeout,
    ProcessGone,
}

/// 通用探活等待：进程仍属我方时反复 probe，直到成功 / 超时 / 进程没了。
pub async fn wait_until_probe_ok<F, Fut>(
    timeout: Duration,
    poll: Duration,
    mut still_ours: impl FnMut() -> bool,
    mut on_tick: impl FnMut(u32),
    mut probe: F,
) -> Result<String, WaitFail>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Option<String>>,
{
    let deadline = tokio::time::Instant::now() + timeout;
    let mut tick: u32 = 0;
    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(WaitFail::Timeout);
        }
        if !still_ours() {
            return Err(WaitFail::ProcessGone);
        }
        if let Some(url) = probe().await {
            return Ok(url);
        }
        tick = tick.wrapping_add(1);
        on_tick(tick);
        tokio::time::sleep(poll).await;
    }
}

pub fn is_port_free_for_bind(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpListener::bind(addr).is_ok()
}

pub fn is_port_in_use(port: u16) -> bool {
    !is_port_free_for_bind(port)
}

/// 自 `start` 起找空闲端口；连续占满则 SPAWN_FAILED。
pub fn find_available_port(start: u16, max_tries: u16) -> Result<u16, String> {
    let mut port = start;
    for _ in 0..max_tries {
        if !is_port_in_use(port) {
            return Ok(port);
        }
        port = port
            .checked_add(1)
            .ok_or_else(|| String::from(HostError::spawn("无可用端口")))?;
    }
    Err(String::from(HostError::spawn(format!(
        "自 {start} 起连续端口均被占用（常见原因：其他桌面端仍占 3081）"
    ))))
}

/// 闭包门禁（路径版）：入口存在 + package.json 可解析 + `@deepseek-ai/*` 硬依赖目录在场。
pub fn assert_harness_closure_at(
    harness_dir: &Path,
    entry: &Path,
    pkg: &Path,
) -> Result<(), String> {
    if !entry.is_file() {
        return Err(String::from(HostError::install(format!(
            "安装后未找到入口 {}",
            entry.display()
        ))));
    }
    if !pkg.is_file() {
        return Err(String::from(HostError::install(format!(
            "缺少 dsh package.json（{}）",
            pkg.display()
        ))));
    }
    let text = fs::read_to_string(pkg)
        .map_err(|e| String::from(HostError::install(format!("读 dsh package.json: {e}"))))?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| String::from(HostError::install(format!("解析 dsh package.json: {e}"))))?;

    let mut missing: Vec<String> = Vec::new();
    let dsh_root = harness_dir
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh");
    if let Some(deps) = json.get("dependencies").and_then(|v| v.as_object()) {
        for name in deps.keys() {
            if !name.starts_with("@deepseek-ai/") {
                continue;
            }
            let short = name.trim_start_matches("@deepseek-ai/");
            let top = harness_dir
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
        return Err(String::from(HostError::install(format!(
            "harness 闭包不完整，缺少依赖：{}。请重试安装或「重置托管运行时」。",
            missing.join(", ")
        ))));
    }
    Ok(())
}

/// 半安装：入口缺失但树里已有痕迹。
pub fn is_harness_partial_at(harness_dir: &Path, entry: &Path) -> bool {
    if entry.is_file() {
        return false;
    }
    if harness_dir.join("package.json").is_file() {
        return true;
    }
    let scope = harness_dir.join("node_modules").join("@deepseek-ai");
    match fs::read_dir(&scope) {
        Ok(rd) => rd.filter_map(|e| e.ok()).next().is_some(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod fault_tests {
    use super::*;
    use crate::runtime_lock::{self, LockPurpose};
    use crate::supervise::probe_service_healthy;
    use std::io::{Read, Write};
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "dsh-fault-{}-{}-{}",
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

    // --- sweep 决策全分支 ---

    #[test]
    fn fault_sweep_clear_when_port_free() {
        assert_eq!(
            decide_orphan_sweep(10, 3081, false, None),
            SweepDecision::ClearStaleFile
        );
    }

    #[test]
    fn fault_sweep_kill_when_owner_matches() {
        assert_eq!(
            decide_orphan_sweep(42, 3081, true, Some(42)),
            SweepDecision::KillOwner { pid: 42, port: 3081 }
        );
    }

    #[test]
    fn fault_sweep_leave_when_foreign_owner() {
        assert_eq!(
            decide_orphan_sweep(42, 3081, true, Some(99)),
            SweepDecision::LeaveAlone
        );
    }

    #[test]
    fn fault_sweep_leave_when_owner_unknown() {
        assert_eq!(
            decide_orphan_sweep(42, 3081, true, None),
            SweepDecision::LeaveAlone
        );
    }

    // --- 端口注入 ---

    #[test]
    fn fault_port_skips_occupied() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let occupied = listener.local_addr().unwrap().port();
        let next = find_available_port(occupied, 20).unwrap();
        assert_ne!(next, occupied);
    }

    #[test]
    fn fault_port_exhaustion_named_spawn_failed() {
        // 占满一段连续端口窗口，再要求同窗口内找空闲 → SPAWN_FAILED
        let mut window = None;
        for candidate in (20_000u16..45_000).step_by(20) {
            let mut holders = Vec::new();
            let mut ok = true;
            for i in 0..5u16 {
                match TcpListener::bind(("127.0.0.1", candidate + i)) {
                    Ok(l) => holders.push(l),
                    Err(_) => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok {
                window = Some((candidate, holders));
                break;
            }
        }
        let (start, holders) = window.expect("need 5 consecutive free ports for fixture");
        let err = find_available_port(start, 5).unwrap_err();
        assert!(
            err.starts_with("SPAWN_FAILED:"),
            "expected SPAWN_FAILED, got {err}"
        );
        assert!(err.contains("连续端口"), "{err}");
        drop(holders);
    }

    // --- 等待环：进程中途死亡 / 超时 / 成功 ---

    #[tokio::test]
    async fn fault_wait_process_gone_named() {
        let alive = Arc::new(AtomicBool::new(true));
        let alive2 = alive.clone();
        let probes = Arc::new(AtomicU32::new(0));
        let probes2 = probes.clone();
        let task = tokio::spawn(async move {
            wait_until_probe_ok(
                Duration::from_secs(2),
                Duration::from_millis(40),
                || alive2.load(Ordering::SeqCst),
                |_| {},
                || {
                    let n = probes2.fetch_add(1, Ordering::SeqCst);
                    async move {
                        if n >= 2 {
                            None
                        } else {
                            None
                        }
                    }
                },
            )
            .await
        });
        tokio::time::sleep(Duration::from_millis(80)).await;
        alive.store(false, Ordering::SeqCst);
        let err = task.await.unwrap().unwrap_err();
        assert_eq!(err, WaitFail::ProcessGone);
    }

    #[tokio::test]
    async fn fault_wait_timeout_when_never_healthy() {
        let err = wait_until_probe_ok(
            Duration::from_millis(200),
            Duration::from_millis(40),
            || true,
            |_| {},
            || async { None },
        )
        .await
        .unwrap_err();
        assert_eq!(err, WaitFail::Timeout);
    }

    #[tokio::test]
    async fn fault_wait_recovers_after_transient_fails() {
        let n = Arc::new(AtomicU32::new(0));
        let n2 = n.clone();
        let url = wait_until_probe_ok(
            Duration::from_secs(2),
            Duration::from_millis(20),
            || true,
            |_| {},
            move || {
                let c = n2.fetch_add(1, Ordering::SeqCst);
                async move {
                    if c >= 3 {
                        Some("http://127.0.0.1:9/?token=ok".into())
                    } else {
                        None
                    }
                }
            },
        )
        .await
        .unwrap();
        assert!(url.contains("token=ok"));
    }

    // --- 探活：挂死 / 翻转 / token 后死亡 ---

    fn serve_hang(listener: TcpListener, stop: Arc<AtomicBool>) {
        listener.set_nonblocking(true).ok();
        while !stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    // 读请求但不写响应 → 客户端超时
                    let mut buf = [0u8; 256];
                    let _ = stream.read(&mut buf);
                    while !stop.load(Ordering::SeqCst) {
                        thread::sleep(Duration::from_millis(50));
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }
    }

    #[tokio::test]
    async fn fault_probe_hang_does_not_count_healthy() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        let server = tokio::task::spawn_blocking(move || serve_hang(listener, stop2));
        let url = format!("http://127.0.0.1:{port}/");
        let t0 = std::time::Instant::now();
        assert!(!probe_service_healthy(&url).await);
        assert!(
            t0.elapsed() < Duration::from_secs(5),
            "probe must honor client timeout"
        );
        stop.store(true, Ordering::SeqCst);
        let _ = server.await;
    }

    #[tokio::test]
    async fn fault_probe_flips_200_to_401() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let phase = Arc::new(AtomicU32::new(0));
        let phase2 = phase.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        let server = tokio::task::spawn_blocking(move || {
            listener.set_nonblocking(true).ok();
            while !stop2.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let mut buf = [0u8; 512];
                        let _ = stream.read(&mut buf);
                        let n = phase2.fetch_add(1, Ordering::SeqCst);
                        let status = if n == 0 {
                            "HTTP/1.1 200 OK"
                        } else {
                            "HTTP/1.1 401 Unauthorized"
                        };
                        let body = "x";
                        let resp = format!(
                            "{status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                            body.len()
                        );
                        let _ = stream.write_all(resp.as_bytes());
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(15));
                    }
                    Err(_) => break,
                }
            }
        });
        let url = format!("http://127.0.0.1:{port}/");
        assert!(probe_service_healthy(&url).await, "first must be 200");
        assert!(
            !probe_service_healthy(&url).await,
            "after flip must reject 401"
        );
        stop.store(true, Ordering::SeqCst);
        let _ = server.await;
    }

    #[tokio::test]
    async fn fault_probe_token_ok_then_server_dies() {
        use std::io::{Read, Write};
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = "faultTok";
        let auth = format!("http://127.0.0.1:{port}/?token={token}");
        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        let server = tokio::task::spawn_blocking(move || {
            listener.set_nonblocking(true).ok();
            while !stop2.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let mut buf = [0u8; 1024];
                        let n = stream.read(&mut buf).unwrap_or(0);
                        let req = String::from_utf8_lossy(&buf[..n]);
                        let first = req.lines().next().unwrap_or("");
                        if first.contains(&format!("token={token}")) {
                            let resp = "HTTP/1.1 303 See Other\r\nLocation: /\r\nSet-Cookie: dsh=1; Path=/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                            let _ = stream.write_all(resp.as_bytes());
                        } else if req.to_lowercase().contains("cookie:") {
                            let body = "OK";
                            let resp = format!(
                                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                                body.len()
                            );
                            let _ = stream.write_all(resp.as_bytes());
                        } else {
                            let resp = "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                            let _ = stream.write_all(resp.as_bytes());
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(15));
                    }
                    Err(_) => break,
                }
            }
        });
        assert!(probe_service_healthy(&auth).await);
        stop.store(true, Ordering::SeqCst);
        let _ = server.await;
        // 服务已死 → 必须失败
        assert!(!probe_service_healthy(&auth).await);
    }

    // --- 锁风暴：外进程持锁时，本进程多线程全部挡下 ---

    #[test]
    fn fault_lock_storm_only_one_holder() {
        let dir = temp_dir("storm");
        let path = dir.join(".runtime.lock");

        let mut child = {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                std::process::Command::new("powershell")
                    .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"])
                    .creation_flags(0x0800_0000)
                    .spawn()
                    .expect("spawn holder fixture")
            }
            #[cfg(not(windows))]
            {
                std::process::Command::new("sleep")
                    .arg("60")
                    .spawn()
                    .expect("spawn holder fixture")
            }
        };
        let foreign = child.id();
        fs::write(&path, format!("{foreign}\nensure\n")).unwrap();

        let barrier = Arc::new(std::sync::Barrier::new(8));
        let results = Arc::new(Mutex::new(Vec::new()));
        let mut attackers = Vec::new();
        for i in 0..8 {
            let b = barrier.clone();
            let p = path.clone();
            let r = results.clone();
            attackers.push(thread::spawn(move || {
                b.wait();
                let outcome = runtime_lock::acquire_at(p, LockPurpose::Reset);
                let ok = outcome.is_ok();
                drop(outcome);
                r.lock().unwrap().push((i, ok));
            }));
        }
        for t in attackers {
            t.join().unwrap();
        }
        let got = results.lock().unwrap().clone();
        let wins = got.iter().filter(|(_, ok)| *ok).count();
        assert_eq!(
            wins, 0,
            "no thread may steal lock from live foreign pid: {got:?}"
        );

        let _ = child.kill();
        let _ = child.wait();
        let g = runtime_lock::acquire_at(path.clone(), LockPurpose::Ensure).unwrap();
        drop(g);
        let _ = fs::remove_dir_all(&dir);
    }

    // --- 半安装 / 坏闭包 ---

    #[test]
    fn fault_closure_rejects_missing_scoped_dep() {
        let root = temp_dir("closure");
        let entry = root.join("node_modules/@deepseek-ai/dsh/lib/bin.js");
        fs::create_dir_all(entry.parent().unwrap()).unwrap();
        fs::write(&entry, "console.log(1)").unwrap();
        let pkg = root.join("node_modules/@deepseek-ai/dsh/package.json");
        fs::write(
            &pkg,
            r#"{"name":"@deepseek-ai/dsh","version":"0.1.0","dependencies":{"@deepseek-ai/missing-pkg":"1.0.0"}}"#,
        )
        .unwrap();
        let err = assert_harness_closure_at(&root, &entry, &pkg).unwrap_err();
        assert!(err.starts_with("INSTALL_FAILED:"), "{err}");
        assert!(err.contains("@deepseek-ai/missing-pkg"), "{err}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn fault_closure_ok_when_dep_present() {
        let root = temp_dir("closure-ok");
        let entry = root.join("node_modules/@deepseek-ai/dsh/lib/bin.js");
        fs::create_dir_all(entry.parent().unwrap()).unwrap();
        fs::write(&entry, "ok").unwrap();
        let pkg = root.join("node_modules/@deepseek-ai/dsh/package.json");
        fs::write(
            &pkg,
            r#"{"name":"@deepseek-ai/dsh","version":"0.1.0","dependencies":{"@deepseek-ai/foo":"1.0.0"}}"#,
        )
        .unwrap();
        fs::create_dir_all(root.join("node_modules/@deepseek-ai/foo")).unwrap();
        assert!(assert_harness_closure_at(&root, &entry, &pkg).is_ok());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn fault_partial_detects_missing_entry_with_tree() {
        let root = temp_dir("partial");
        let entry = root.join("node_modules/@deepseek-ai/dsh/lib/bin.js");
        fs::create_dir_all(root.join("node_modules/@deepseek-ai/dsh")).unwrap();
        fs::write(root.join("package.json"), "{}").unwrap();
        assert!(is_harness_partial_at(&root, &entry));
        fs::create_dir_all(entry.parent().unwrap()).unwrap();
        fs::write(&entry, "x").unwrap();
        assert!(!is_harness_partial_at(&root, &entry));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn fault_corrupt_package_json_meta_empty() {
        let root = temp_dir("meta");
        let pkg = root.join("package.json");
        fs::write(&pkg, "{not-json").unwrap();
        let meta = crate::runtime::package::read_harness_meta_at_pkg(&pkg);
        // 损坏 JSON：无 version；digest 仍是字节指纹（不把坏包当「有版本」）
        assert!(meta.version.is_none());
        assert_eq!(meta.digest.as_ref().map(|d| d.len()), Some(16));
        let _ = fs::remove_dir_all(&root);
    }

    // --- boot_lock 串行（交错抵抗） ---

    #[tokio::test]
    async fn fault_boot_lock_serializes_two_critical_sections() {
        use crate::supervise::HarnessState;
        let state = Arc::new(HarnessState::default());
        let order = Arc::new(Mutex::new(Vec::new()));

        let s1 = state.clone();
        let o1 = order.clone();
        let a = tokio::spawn(async move {
            let _g = s1.boot_lock.lock().await;
            o1.lock().unwrap().push("A-enter");
            tokio::time::sleep(Duration::from_millis(150)).await;
            o1.lock().unwrap().push("A-exit");
        });

        tokio::time::sleep(Duration::from_millis(20)).await;
        let s2 = state.clone();
        let o2 = order.clone();
        let b = tokio::spawn(async move {
            let _g = s2.boot_lock.lock().await;
            o2.lock().unwrap().push("B-enter");
            o2.lock().unwrap().push("B-exit");
        });

        a.await.unwrap();
        b.await.unwrap();
        let seq = order.lock().unwrap().clone();
        assert_eq!(
            seq,
            vec!["A-enter", "A-exit", "B-enter", "B-exit"],
            "boot_lock must serialize: {seq:?}"
        );
    }
}
