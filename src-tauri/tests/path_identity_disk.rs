//! B50 路径身份集成测试（真实 temp 落盘）。

use deepseek_harness_desktop_lib::path_audit::run_path_identity_disk_audit;

#[test]
fn path_identity_disk_audit_all_pass() {
    let report = run_path_identity_disk_audit(true);
    for c in &report.cases {
        assert!(c.ok, "{}: {}", c.id, c.detail);
    }
    assert!(report.ok);
}
