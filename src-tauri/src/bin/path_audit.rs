//! 落盘路径审计：输出 JSON，供 `pnpm audit:path-identity` 消费。
//!
//! ```text
//! cargo run --bin path_audit
//! cargo run --bin path_audit -- --no-env   # 跳过 APPDATA 环境变量场景
//! ```

use deepseek_harness_desktop_lib::path_audit::run_path_identity_disk_audit;

fn main() {
    let include_env = !std::env::args().any(|a| a == "--no-env");
    let report = run_path_identity_disk_audit(include_env);
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("serialize audit report")
    );
    if !report.ok {
        std::process::exit(1);
    }
}
