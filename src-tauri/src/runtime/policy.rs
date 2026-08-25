//! 运行时偏好 ↔ 实际种类：纯决策（无 IO），供 ensure 复用门禁与测试。

use crate::system_runtime::{ActiveRuntimeKind, RuntimeSource};

/// 由设置偏好 + 本机是否可探测，得到「应当」跑的种类。
/// `System` 且不可探测 → `None`（不可 reuse，须走 reconcile 报错）。
pub fn desired_active_kind(
    source: RuntimeSource,
    system_available: bool,
) -> Option<ActiveRuntimeKind> {
    match source {
        RuntimeSource::Hosted => Some(ActiveRuntimeKind::Hosted),
        RuntimeSource::System => {
            if system_available {
                Some(ActiveRuntimeKind::System)
            } else {
                None
            }
        }
        RuntimeSource::Auto => {
            if system_available {
                Some(ActiveRuntimeKind::System)
            } else {
                Some(ActiveRuntimeKind::Hosted)
            }
        }
    }
}

/// Actual 是否已对齐 Desired（可短路复用健康进程）。
pub fn active_matches_desired(
    active: ActiveRuntimeKind,
    desired: ActiveRuntimeKind,
) -> bool {
    active == desired
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desired_hosted_always() {
        assert_eq!(
            desired_active_kind(RuntimeSource::Hosted, true),
            Some(ActiveRuntimeKind::Hosted)
        );
        assert_eq!(
            desired_active_kind(RuntimeSource::Hosted, false),
            Some(ActiveRuntimeKind::Hosted)
        );
    }

    #[test]
    fn desired_system_requires_detect() {
        assert_eq!(
            desired_active_kind(RuntimeSource::System, true),
            Some(ActiveRuntimeKind::System)
        );
        assert_eq!(desired_active_kind(RuntimeSource::System, false), None);
    }

    #[test]
    fn desired_auto_prefers_system() {
        assert_eq!(
            desired_active_kind(RuntimeSource::Auto, true),
            Some(ActiveRuntimeKind::System)
        );
        assert_eq!(
            desired_active_kind(RuntimeSource::Auto, false),
            Some(ActiveRuntimeKind::Hosted)
        );
    }

    #[test]
    fn match_matrix() {
        assert!(active_matches_desired(
            ActiveRuntimeKind::System,
            ActiveRuntimeKind::System
        ));
        assert!(!active_matches_desired(
            ActiveRuntimeKind::System,
            ActiveRuntimeKind::Hosted
        ));
        assert!(!active_matches_desired(
            ActiveRuntimeKind::Hosted,
            ActiveRuntimeKind::System
        ));
    }

    /// 1-switch 决策表：reuse 当且仅当 desired 可解析且与 active 相同。
    #[test]
    fn reuse_gate_1switch() {
        let cases: &[(RuntimeSource, bool, Option<ActiveRuntimeKind>, bool)] = &[
            // source, system_ok, active, expect_reuse_possible
            (
                RuntimeSource::Hosted,
                true,
                Some(ActiveRuntimeKind::Hosted),
                true,
            ),
            (
                RuntimeSource::Hosted,
                true,
                Some(ActiveRuntimeKind::System),
                false,
            ),
            (
                RuntimeSource::System,
                true,
                Some(ActiveRuntimeKind::System),
                true,
            ),
            (
                RuntimeSource::System,
                true,
                Some(ActiveRuntimeKind::Hosted),
                false,
            ),
            (RuntimeSource::System, false, Some(ActiveRuntimeKind::System), false),
            (
                RuntimeSource::Auto,
                true,
                Some(ActiveRuntimeKind::System),
                true,
            ),
            (
                RuntimeSource::Auto,
                false,
                Some(ActiveRuntimeKind::Hosted),
                true,
            ),
            (
                RuntimeSource::Auto,
                true,
                Some(ActiveRuntimeKind::Hosted),
                false,
            ),
            (RuntimeSource::Hosted, true, None, false),
        ];
        for (source, sys, active, expect) in cases {
            let desired = desired_active_kind(*source, *sys);
            let can = match (desired, active) {
                (Some(d), Some(a)) => active_matches_desired(*a, d),
                _ => false,
            };
            assert_eq!(
                can, *expect,
                "source={source:?} sys={sys} active={active:?}"
            );
        }
    }
}
