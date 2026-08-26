//! 监督托管 dsh：spawn、健康检查、pid 落盘、退出/启动清扫。

use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Runtime};

use crate::error::HostError;
use crate::paths;
use crate::progress::{self, InstallStage};
use crate::runtime::package::resolve_dsh_entry;
use crate::settings;
use crate::system_runtime::{ActiveRuntimeKind, SystemRuntime};

#[cfg(windows)]
use crate::platform::{self, OwnedProcessHandle};

pub struct HarnessState {
    #[cfg(windows)]
    pub owned: Mutex<Option<OwnedProcessHandle>>,
    pub pid: Mutex<Option<u32>>,
    pub port: Mutex<u16>,
    /// 会话级干净 profile：优先于 settings 的 DSH_HOME 覆盖。
    pub session_dsh_home: Mutex<Option<PathBuf>>,
    /// 当前会话实际使用的运行时来源（spawn 后写入）。
    pub active_runtime: Mutex<Option<ActiveRuntimeKind>>,
    /// ensure 阶段选定的启动计划（spawn 消费）。
    pub pending_launch: Mutex<Option<LaunchPlan>>,
    /// 防止 HMR / StrictMode / 重复点击并行跑 ensure（会叠多个 npm install）。
    pub boot_lock: tokio::sync::Mutex<()>,
}

#[derive(Debug, Clone)]
pub struct LaunchPlan {
    pub kind: ActiveRuntimeKind,
    pub node: PathBuf,
    pub entry: PathBuf,
    pub cwd: PathBuf,
}

impl LaunchPlan {
    pub fn hosted<R: Runtime>(app: &AppHandle<R>) -> Result<Self, String> {
        let node = paths::node_binary(app)?;
        let entry = resolve_dsh_entry(app)?;
        let cwd = paths::harness_dir(app)?;
        Ok(Self {
            kind: ActiveRuntimeKind::Hosted,
            node,
            entry,
            cwd,
        })
    }

    pub fn system(rt: SystemRuntime) -> Self {
        Self {
            kind: ActiveRuntimeKind::System,
            node: rt.node,
            entry: rt.entry,
            cwd: rt.cwd,
        }
    }
}

impl Default for HarnessState {
    fn default() -> Self {
        Self {
            #[cfg(windows)]
            owned: Mutex::new(None),
            pid: Mutex::new(None),
            port: Mutex::new(paths::default_port()),
            session_dsh_home: Mutex::new(None),
            active_runtime: Mutex::new(None),
            pending_launch: Mutex::new(None),
            boot_lock: tokio::sync::Mutex::new(()),
        }
    }
}

pub fn set_pending_launch(state: &HarnessState, plan: LaunchPlan) -> Result<(), String> {
    *state.pending_launch.lock().map_err(|e| e.to_string())? = Some(plan);
    Ok(())
}

fn take_launch_plan<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<LaunchPlan, String> {
    if let Some(plan) = state
        .pending_launch
        .lock()
        .map_err(|e| e.to_string())?
        .take()
    {
        return Ok(plan);
    }
    // 无 pending：按 settings 同步拼计划（不 ensure；缺入口则失败）
    let cfg = settings::load(app);
    match cfg.runtime_source {
        crate::system_runtime::RuntimeSource::Hosted => LaunchPlan::hosted(app),
        crate::system_runtime::RuntimeSource::System => {
            crate::system_runtime::resolve_system_runtime()
                .map(LaunchPlan::system)
                .ok_or_else(|| {
                    String::from(HostError::install(
                        "未检测到本机可用的 Node / @deepseek-ai/dsh。可在设置将「Harness 安装」改为应用内安装，或先安装官方 CLI。",
                    ))
                })
        }
        crate::system_runtime::RuntimeSource::Auto => {
            if let Some(rt) = crate::system_runtime::resolve_system_runtime() {
                Ok(LaunchPlan::system(rt))
            } else {
                LaunchPlan::hosted(app)
            }
        }
    }
}

/// 当前 spawn 使用的 `DSH_HOME`（干净 profile 会话优先）。
pub fn effective_dsh_home<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
    cfg: &settings::ShellSettings,
) -> PathBuf {
    if let Ok(guard) = state.session_dsh_home.lock() {
        if let Some(path) = guard.as_ref() {
            return path.clone();
        }
    }
    paths::dsh_home(app, Some(cfg.dsh_home_override.as_str()))
}

pub fn is_clean_profile_active(state: &HarnessState) -> bool {
    state
        .session_dsh_home
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|_| true))
        .unwrap_or(false)
}

pub fn activate_clean_profile_session<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<PathBuf, String> {
    let dir = paths::clean_profile_session_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| {
        String::from(HostError::spawn(format!("mkdir clean profile: {e}")))
    })?;
    *state
        .session_dsh_home
        .lock()
        .map_err(|e| e.to_string())? = Some(dir.clone());
    progress::append_shell_log(
        app,
        &format!("[ops] clean_profile_session {}", dir.display()),
    );
    Ok(dir)
}

pub fn deactivate_clean_profile_session<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) {
    if let Ok(mut guard) = state.session_dsh_home.lock() {
        if guard.take().is_some() {
            progress::append_shell_log(app, "[ops] exit_clean_profile_session");
        }
    }
}

/// 从 pid 文件读取 `(pid, port)`；格式损坏时返回 `None` 并清理文件。
pub fn read_pid_record<R: Runtime>(app: &AppHandle<R>) -> Option<(u32, u16)> {
    let path = paths::pid_file(app).ok()?;
    let text = fs::read_to_string(&path).ok()?;
    let mut lines = text.lines();
    let pid = lines.next()?.trim().parse::<u32>().ok()?;
    let port = lines.next()?.trim().parse::<u16>().ok()?;
    Some((pid, port))
}

/// 启动前清扫：仅杀「pid 文件记录且仍占该端口」的孤儿，避免误杀他人 node。
/// （R1：已移除 wmic 按路径扫杀。）
pub fn sweep_orphans<R: Runtime>(app: &AppHandle<R>) {
    log::debug!(target: "shell::supervise", "sweep_orphans");
    let Ok(pid_path) = paths::pid_file(app) else {
        return;
    };
    let Ok(text) = fs::read_to_string(&pid_path) else {
        return;
    };
    let mut lines = text.lines();
    let (Some(pid), Some(port)) = (
        lines.next().and_then(|l| l.trim().parse::<u32>().ok()),
        lines.next().and_then(|l| l.trim().parse::<u16>().ok()),
    ) else {
        let _ = fs::remove_file(&pid_path);
        return;
    };
    if !is_port_in_use(port) {
        let _ = fs::remove_file(&pid_path);
        return;
    }
    if port_owner_pid(port) != Some(pid) {
        return;
    }
    kill_pid_tree(pid);
    log::info!(target: "shell::supervise", "sweep_orphans killed pid={pid} port={port}");
    let _ = fs::remove_file(&pid_path);
}

fn find_available_port(start: u16) -> Result<u16, String> {
    let mut port = start;
    for _ in 0..20 {
        if !is_port_in_use(port) {
            return Ok(port);
        }
        port = port
            .checked_add(1)
            .ok_or_else(|| String::from(HostError::spawn("无可用端口")))?;
    }
    Err(String::from(
        HostError::spawn(format!(
            "自 {start} 起连续端口均被占用（常见原因：其他桌面端仍占 3081）"
        )),
    ))
}

fn is_port_free_for_bind(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpListener::bind(addr).is_ok()
}

fn is_port_in_use(port: u16) -> bool {
    !is_port_free_for_bind(port)
}

pub async fn spawn_and_wait_healthy<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Result<(u16, String), String> {
    #[cfg(not(windows))]
    {
        let _ = (app, state);
        return Err(String::from(HostError::spawn("仅 Windows 支持")));
    }

    #[cfg(windows)]
    {
        let cfg = settings::load(app);
        let preferred = if cfg.preferred_port >= 1024 {
            cfg.preferred_port
        } else {
            paths::default_port()
        };
        log::info!(target: "shell::supervise", "spawn_and_wait_healthy begin preferred={preferred}");
        let port = find_available_port(preferred)?;
        if port != preferred {
            progress::emit_progress(
                app,
                InstallStage::Start,
                &format!("端口 {preferred} 被占用，改用 {port}"),
                Some(88),
            );
        }
        *state.port.lock().map_err(|e| e.to_string())? = port;

        let plan = take_launch_plan(app, state)?;
        let node = &plan.node;
        let entry = &plan.entry;
        let cwd = &plan.cwd;
        if !paths::is_file(node) {
            return Err(String::from(
                HostError::node_missing(node.display().to_string()),
            ));
        }
        if !paths::is_file(entry) {
            return Err(String::from(
                HostError::harness_not_found(entry.display().to_string()),
            ));
        }
        let dsh_home = effective_dsh_home(app, state, &cfg);
        fs::create_dir_all(&dsh_home).map_err(|e| {
            String::from(HostError::spawn(format!("mkdir DSH_HOME: {e}")))
        })?;

        stop_owned(state);

        let gen = crate::logging::next_spawn_gen();
        let log_path = paths::harness_log_file(app)?;
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                String::from(HostError::spawn(format!("mkdir logs: {e}")))
            })?;
        }
        append_log(
            &log_path,
            &format!(
                "--- spawn gen={gen} ({:?}) dsh web --host 127.0.0.1 --port {port} ---",
                plan.kind
            ),
        );
        crate::logging::record_op(&format!(
            "action=harness.spawn spawn_gen={gen} port={port} kind={:?} outcome=ok",
            plan.kind
        ));

        progress::emit_progress(
            app,
            InstallStage::Start,
            &format!("正在启动官方 UI（127.0.0.1:{port}）…"),
            Some(90),
        );

        let node_dir = node
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .to_string_lossy()
            .into_owned();
        let mut envs = settings::proxy_env_overrides(&cfg);
        envs.insert("DSH_HOME".into(), dsh_home.to_string_lossy().into_owned());
        envs.insert("NODE_OPTIONS".into(), "--dns-result-order=ipv4first".into());
        match plan.kind {
            ActiveRuntimeKind::Hosted => {
                envs.insert("PATH".into(), node_dir);
            }
            ActiveRuntimeKind::System => {
                let user_path = std::env::var("PATH").unwrap_or_default();
                envs.insert("PATH".into(), format!("{node_dir};{user_path}"));
            }
        }

        let args = vec![
            OsString::from(entry.as_os_str()),
            OsString::from("web"),
            OsString::from("--host"),
            OsString::from("127.0.0.1"),
            OsString::from("--port"),
            OsString::from(port.to_string()),
            OsString::from("--no-open"),
        ];

        let proc = platform::spawn_owned(node, &args, Some(cwd), &envs)
            .map_err(|e| String::from(HostError::spawn(format!("{e}"))))?;
        let pid = proc.pid;
        spawn_file_readers(proc.stdout, proc.stderr, log_path.clone());
        *state.owned.lock().map_err(|e| e.to_string())? = Some(proc.handle);
        *state.pid.lock().map_err(|e| e.to_string())? = Some(pid);
        *state.active_runtime.lock().map_err(|e| e.to_string())? = Some(plan.kind);
        write_pid_file(app, pid, port)?;

        let url = paths::service_url(port);
        wait_healthy(app, &url, state, pid, port, Duration::from_secs(90)).await?;
        progress::emit_progress(app, InstallStage::Start, &format!("官方 UI 已就绪：{url}"), Some(100));
        Ok((port, url))
        }
}

/// 本壳已托管进程且根路径已 HTTP 200 时复用，避免重复 ensure 杀进程。
/// 若 pid 文件端口与内存端口不一致，以探活成功的端口为准（漂移自愈）。
pub async fn try_reuse_healthy<R: Runtime>(
    app: &AppHandle<R>,
    state: &HarnessState,
) -> Option<progress::ReadyPayload> {
    let state_pid = state.pid.lock().ok().and_then(|g| *g);
    let file_record = read_pid_record(app);
    let pid = state_pid.or_else(|| file_record.map(|(p, _)| p))?;

    if !process_still_ours(state, pid) {
        return None;
    }

    let state_port = state
        .port
        .lock()
        .ok()
        .map(|g| *g)
        .unwrap_or_else(paths::default_port);

    let mut candidate_ports = Vec::new();
    if let Some((file_pid, file_port)) = file_record {
        if file_pid == pid {
            candidate_ports.push(file_port);
        }
    }
    candidate_ports.push(state_port);
    candidate_ports.sort_unstable();
    candidate_ports.dedup();

    for port in candidate_ports {
        if !process_still_ours(state, pid) {
            return None;
        }
        let url = paths::service_url(port);
        if !probe_service_healthy(&url).await {
            continue;
        }
        if let Ok(mut g) = state.port.lock() {
            if *g != port {
                log::info!(
                    target: "shell::supervise",
                    "healed port drift {} -> {port}",
                    *g
                );
                progress::append_shell_log(app, &format!("[ops] healed port drift -> {port}"));
            }
            *g = port;
        }
        if let Ok(mut g) = state.pid.lock() {
            *g = Some(pid);
        }
        progress::emit_progress(
            app,
            InstallStage::Start,
            &format!("复用已就绪服务：{url}"),
            Some(100),
        );
        return Some(progress::ReadyPayload { url, port });
    }
    None
}

pub async fn probe_service_healthy(url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client.get(url).send().await {
        Ok(resp) => resp.status().as_u16() == 200,
        Err(_) => false,
    }
}

/// 仅认 HTTP 200：避免把他人占用端口上的 4xx 空响应当成「已连接」。
async fn wait_healthy<R: Runtime>(
    app: &AppHandle<R>,
    url: &str,
    state: &HarnessState,
    expected_pid: u32,
    port: u16,
    timeout: Duration,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
        .map_err(|e| String::from(HostError::health_timeout(format!("client: {e}"))))?;
    let deadline = tokio::time::Instant::now() + timeout;
    let mut tick: u32 = 0;
    loop {
        if tokio::time::Instant::now() > deadline {
            if harness_log_suggests_plugin_issue(app) {
                return Err(String::from(HostError::plugin_load_failed(
                    plugin_load_failed_message(
                        app,
                        format!("{url} 在时限内未就绪，日志提示可能与插件加载有关"),
                    ),
                )));
            }
            return Err(String::from(
                HostError::health_timeout(format!(
                    "{url} 在时限内未返回 HTTP 200（请查看 AppData/logs/harness.log）"
                )),
            ));
        }

        if !process_still_ours(state, expected_pid) {
            if harness_log_suggests_plugin_issue(app) {
                return Err(String::from(HostError::plugin_load_failed(
                    plugin_load_failed_message(
                        app,
                        format!(
                            "dsh 进程 {expected_pid} 已退出；日志提示可能与插件或 profile 配置有关"
                        ),
                    ),
                )));
            }
            return Err(String::from(
                HostError::spawn(format!(
                    "dsh 进程 {expected_pid} 已退出，未能监听 {port}"
                )),
            ));
        }

        match client.get(url).send().await {
            Ok(resp) if resp.status().as_u16() == 200 => {
                log::info!(target: "shell::supervise", "healthy url={url}");
                return Ok(());
            }
            Ok(resp) => {
                tick += 1;
                if tick % 3 == 0 {
                    progress::emit_progress(
                        app,
                        InstallStage::Start,
                        &format!(
                            "等待官方 UI… HTTP {}（{url}）",
                            resp.status().as_u16()
                        ),
                        Some(92),
                    );
                }
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
            Err(_) => {
                tick += 1;
                if tick % 2 == 0 {
                    progress::emit_progress(
                        app,
                        InstallStage::Start,
                        &format!("等待官方 UI 监听 {url}…"),
                        Some(91),
                    );
                }
                tokio::time::sleep(Duration::from_millis(400)).await;
            }
        }
    }
}

fn harness_log_tail<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let path = paths::harness_log_file(app).ok()?;
    let text = fs::read_to_string(&path).unwrap_or_default();
    if text.is_empty() {
        return None;
    }
    Some(crate::logging::tail_since_last_spawn(&text).to_string())
}

fn harness_log_suggests_plugin_issue<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Some(tail) = harness_log_tail(app) else {
        return false;
    };
    let lower = tail.to_lowercase();
    lower.contains("plugin tree")
        || lower.contains("plugin")
        || lower.contains("cordis")
        || lower.contains("credentials")
        || lower.contains("dshmarket")
}

fn harness_log_plugin_detail<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    harness_log_tail(app).and_then(|tail| crate::logging::extract_plugin_root_cause(&tail))
}

fn plugin_load_failed_message<R: Runtime>(app: &AppHandle<R>, context: String) -> String {
    match harness_log_plugin_detail(app) {
        Some(detail) => format!("{context}\n\n{detail}"),
        None => context,
    }
}

fn process_still_ours(state: &HarnessState, expected_pid: u32) -> bool {
    #[cfg(windows)]
    {
        if let Ok(guard) = state.owned.lock() {
            if let Some(h) = guard.as_ref() {
                return h.pid() == expected_pid && h.is_running();
            }
        }
        false
    }
    #[cfg(not(windows))]
    {
        let _ = (state, expected_pid);
        true
    }
}

fn spawn_file_readers(stdout: std::fs::File, stderr: std::fs::File, log_path: PathBuf) {
    let path = log_path.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            append_log(&path, &format!("[out] {line}"));
            #[cfg(debug_assertions)]
            crate::logging::tee_harness_line_to_host(false, &line);
        }
    });
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            append_log_level(&log_path, "WARN", &format!("[err] {line}"));
            #[cfg(debug_assertions)]
            crate::logging::tee_harness_line_to_host(true, &line);
        }
    });
}

/// 最小结构化日志：统一 `[LEVEL]` 前缀（不引入 tracing 全家桶）。
fn append_log(path: &PathBuf, line: &str) {
    append_log_level(path, "INFO", line);
}

fn append_log_level(path: &PathBuf, level: &str, line: &str) {
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let stamped = if line.starts_with('[') {
            line.to_string()
        } else {
            format!("[{level}] {line}")
        };
        let _ = writeln!(f, "{stamped}");
    }
}

pub fn read_log_tail<R: Runtime>(app: &AppHandle<R>, max_chars: usize) -> Result<String, String> {
    let path = paths::harness_log_file(app)?;
    let text = fs::read_to_string(&path).unwrap_or_default();
    if text.len() <= max_chars {
        return Ok(text);
    }
    Ok(text[text.len() - max_chars..].to_string())
}

pub fn stop_owned(state: &HarnessState) {
    #[cfg(windows)]
    {
        let mut handled = false;
        if let Ok(mut guard) = state.owned.lock() {
            if let Some(handle) = guard.take() {
                let pid = handle.pid();
                if handle.is_running() {
                    kill_pid_tree(pid);
                }
                drop(handle);
                handled = true;
            }
        }
        if let Ok(mut pid) = state.pid.lock() {
            if let Some(p) = pid.take() {
                if !handled {
                    kill_pid_tree(p);
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(mut pid) = state.pid.lock() {
            if let Some(p) = pid.take() {
                kill_pid_tree(p);
            }
        }
    }
}

pub fn stop_and_clear_pid<R: Runtime>(app: &AppHandle<R>, state: &HarnessState) {
    stop_owned(state);
    if let Ok(mut active) = state.active_runtime.lock() {
        *active = None;
    }
    if let Ok(mut pending) = state.pending_launch.lock() {
        *pending = None;
    }
    if let Ok(path) = paths::pid_file(app) {
        let _ = fs::remove_file(path);
    }
}

/// 壳拥有的 harness 进程是否仍在跑（设置启停真源；≠ 入口文件是否存在）。
pub fn process_is_running(state: &HarnessState) -> bool {
    #[cfg(windows)]
    {
        if let Ok(guard) = state.owned.lock() {
            if let Some(h) = guard.as_ref() {
                return h.is_running();
            }
        }
        false
    }
    #[cfg(not(windows))]
    {
        state.pid.lock().ok().and_then(|g| *g).is_some()
    }
}

fn write_pid_file<R: Runtime>(app: &AppHandle<R>, pid: u32, port: u16) -> Result<(), String> {
    let path = paths::pid_file(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("pid file mkdir: {e}"))?;
    }
    fs::write(&path, format!("{pid}\n{port}\n")).map_err(|e| format!("write pid: {e}"))
}

fn kill_pid_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        use std::os::windows::process::CommandExt;
        // taskkill 本身可无窗；此处仍用 NO_WINDOW 即可（非 node 孙进程树）
        cmd.creation_flags(0x08000000);
        let _ = cmd.output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .output();
    }
}

fn port_owner_pid(port: u16) -> Option<u32> {
    #[cfg(windows)]
    {
        let output = Command::new("netstat").arg("-ano").output().ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let suffix = format!(":{port}");
        for line in text.lines() {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 5 || fields[0] != "TCP" || fields[3] != "LISTENING" {
                continue;
            }
            if fields[1].ends_with(&suffix) {
                return fields[4].parse().ok();
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        let _ = port;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn find_available_port_skips_bound() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let occupied = listener.local_addr().unwrap().port();
        let next = find_available_port(occupied).unwrap();
        assert_ne!(next, occupied);
        let probe = TcpListener::bind(("127.0.0.1", next));
        assert!(probe.is_ok());
    }

    #[test]
    fn is_port_in_use_detects_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(is_port_in_use(port));
    }
}
