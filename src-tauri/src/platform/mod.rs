//! 平台相关：Windows 进程 spawn / 句柄所有权。

#[cfg(windows)]
pub mod windows;

#[cfg(windows)]
pub use windows::spawn::{spawn_and_wait_streaming, spawn_owned, OwnedProcessHandle};
