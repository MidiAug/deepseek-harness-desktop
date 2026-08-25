//! boot_lock **静态结构** fitness（R10 / R10b）。
//!
//! ## 本模块证明什么 / 不证明什么
//! - **证明**：关键运维入口的源码中出现 `boot_lock.lock()`，且
//!   `ensure_and_start` 在解析/安装路径之前获取锁（文本顺序契约）。
//! - **不证明**：运行时无竞态、无双 `ensure`、取消交错安全。
//!   真并发/交错属 holistic / 集成层（见 `dev/knowledge-base/07-host-lifecycle-interleaving.md`）。
//!
//! 对齐 Evolutionary Architecture：原子 + 触发式结构守卫；勿把本测当成并发证明。

#[cfg(test)]
mod boot_lock_static_structure {
    use std::path::Path;

    fn read_src(rel: &str) -> String {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        std::fs::read_to_string(manifest.join("src").join(rel)).unwrap_or_default()
    }

    /// 静态：关键路径源码含 `boot_lock.lock()`（非运行时互斥证明）。
    #[test]
    fn critical_ops_source_mentions_boot_lock() {
        let runtime = read_src("runtime/mod.rs");
        for name in [
            "ensure_and_start",
            "start_clean_profile",
            "reset_hosted_runtime",
            "reset_dsh_home",
            "reinstall_dsh",
            "upgrade_system_harness",
            "restart_harness",
        ] {
            assert!(
                runtime.contains(name),
                "runtime/mod.rs missing fn marker {name}"
            );
        }
        let locks = runtime.matches("boot_lock.lock()").count();
        assert!(
            locks >= 7,
            "expected ≥7 boot_lock.lock() in runtime/mod.rs, got {locks}"
        );

        let update = read_src("update.rs");
        assert!(
            update.contains("boot_lock.lock()"),
            "apply_harness_update source must mention boot_lock"
        );

        let lib = read_src("lib.rs");
        assert!(
            lib.contains("boot_lock.lock()"),
            "prepare_shell_update source must mention boot_lock"
        );
    }

    /// 静态：`ensure_and_start` 函数体内 lock 文本位于 launch/install 相关调用之前。
    #[test]
    fn ensure_and_start_lock_text_before_launch_work() {
        let runtime = read_src("runtime/mod.rs");
        let start = runtime
            .find("pub async fn ensure_and_start")
            .expect("ensure_and_start");
        let body = &runtime[start..];
        let lock_at = body
            .find("boot_lock.lock()")
            .expect("lock in ensure_and_start");
        let install_at = body
            .find("ensure_runtime_installed")
            .or_else(|| body.find("resolve_launch_plan"));
        if let Some(inst) = install_at {
            assert!(
                lock_at < inst,
                "ensure_and_start must lock before launch/install work (source order)"
            );
        }
    }
}
