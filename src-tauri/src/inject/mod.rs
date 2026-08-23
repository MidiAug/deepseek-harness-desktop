//! Harness iframe 初始化脚本注册表（顺序固定；新增注入只改本模块）。

use crate::context_menu;
use crate::selection_hygiene;
use crate::session_log_proxy;
use crate::sidebar_probe;

/// 按固定顺序拼接，供 `WebviewWindowBuilder::initialization_script_for_all_frames`。
pub fn concat_for_all_frames() -> String {
    [
        sidebar_probe::INIT_SCRIPT,
        selection_hygiene::INIT_SCRIPT,
        session_log_proxy::INIT_SCRIPT,
        context_menu::INIT_SCRIPT,
    ]
    .concat()
}
