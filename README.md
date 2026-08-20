# deepseek-harness-desktop

DeepSeek Harness（`dsh`）的 **可信桌面宿主**：管安装、进程、网络、窗口与 harness 更新；主界面仍是官方 Web UI。

## 文档

给使用者看的说明在 [`docs/`](docs/README.md)：

- [快速开始](docs/getting-started.md)
- [配置（代理 / 镜像 / 数据目录）](docs/configuration.md)
- [排查](docs/troubleshooting.md)

## 开发

前置：

- Node.js 18+（建议 LTS）与 **pnpm 9+**
- [Rust](https://www.rust-lang.org/tools/install)（`rustc` / `cargo`）
- Windows：[WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（较新系统通常已自带）

命令（见 [`dev/adr/ADR-001-shell-stack.md`](dev/adr/ADR-001-shell-stack.md)；当前批次 [`dev/ACTIVE.md`](dev/ACTIVE.md)）：

```bash
pnpm install
pnpm tauri dev
```

若 `pnpm` 命令异常（例如被其他应用的 shim 抢占 PATH），可先执行 `npm install -g pnpm@9`，并确保 `%AppData%\npm` 排在该 shim 之前。

本地开发材料（默认不上传）：`dev/`（规划/调研）、`.cursor/`（规则）、`reference/`（源码对照）。
