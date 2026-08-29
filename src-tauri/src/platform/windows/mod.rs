//! Windows 平台子模块。

pub mod spawn;

use std::process::Command;

/// `CREATE_NO_WINDOW`：探测用子进程（where / netstat / reg / node -e）勿闪控制台。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 给 `Command::output()` 类探测加上无窗标志（不用于长驻 dsh；见 `spawn`）。
pub fn silence_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
