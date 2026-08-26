//! Harness iframe 初始化脚本 — B49 单 bundle（`src-tauri/inject/bundle.js`）。
//! 生成：`pnpm build:inject` 或 `node scripts/bundle-inject.mjs`

/// 供 `WebviewWindowBuilder::initialization_script_for_all_frames`。
pub fn concat_for_all_frames() -> String {
    include_str!("../../inject/bundle.js").to_string()
}
