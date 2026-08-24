# deepseek-harness-desktop

**DeepSeek Harness 的可信桌面宿主** — 基于 Tauri 2，管安装、进程、网络、窗口与更新；主界面仍是官方 Web UI。

English · [简体中文文档](docs/README.md)

> DeepSeek Harness 已提供完整的 agent 运行时与 Web UI。  
> **deepseek-harness-desktop 不重写 Harness**，只补齐「下载即用」的桌面宿主能力。

## 下载

Windows 安装包：[GitHub Releases](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)

> 当前首发 **Windows 10/11 x64**。macOS / Linux 尚未支持。

## 为什么做这个项目

官方 Harness 能力完整，但普通用户往往卡在：装 Node、跑终端、占端口、关不干净进程、配代理。  
本项目把这些收进一个 **轻量原生壳**里：

| 痛点 | 本项目的做法 |
|------|-------------|
| 已装 CLI 还要再下一份 | **默认复用本机 dsh**；没有再托管到 AppData |
| 不会配环境 | 无本机栈时自动下载托管 Node + `@deepseek-ai/dsh` |
| 数据和 CLI 不互通 | 默认 `$DSH_HOME=~/.dsh`，会话 / 插件与官方 CLI 共用 |
| 桌面壳常改 UI | **不 patch** 上游包；主区 iframe 加载官方 Web UI |
| 安全边界模糊 | Harness 页默认无通用 Tauri FS/Shell IPC |
| 壳和内核绑死 | 壳自更新独立；托管模式下 harness 由壳更新，系统模式不碰全局包 |

## 功能亮点

- **零前置依赖（兜底）**：无本机 dsh 时自动下载托管 Node + `@deepseek-ai/dsh`
- **本机优先**：已装官方 CLI 时可直接嵌入，不强制再下一份
- **可信进程生命周期**：退出回收本会话 spawn 的 `node`/`dsh`；崩溃后启动清扫
- **网络友好**：国内 npmmirror 镜像（默认）、系统/自定义 HTTP·SOCKS 代理；设置即时落盘
- **与官方设置同步**：语言、主题读写 `~/.dsh/settings.yaml`，与 DeepSeek 设置一致
- **简洁顶栏模式**：透明顶栏叠在官方 UI 上，窗控悬停显现；可代理 Session log 下载
- **故障恢复**：首跑失败页、干净 profile 启动（不删你的 `~/.dsh`）、重置托管运行时、一键导出诊断
- **壳自更新**：启动后与每 6 小时后台检查；下载完成后用户确认再重启安装
- **Harness 独立更新**：托管模式下关于页可更新 AppData 包；系统模式请用本机 npm
- **单实例 + 托盘**：二次启动聚焦已有窗口；可最小化到托盘

## 快速开始

### 安装包用户

1. 下载并安装 [最新 Release](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)  
2. 打开应用：若本机已有 dsh 则直接进入；否则等待托管下载  
3. 主区出现官方 DeepSeek Harness Web UI  
4. 需要代理、镜像或强制托管/本机：**顶栏齿轮 → 壳设置**

### 从源码开发

**前置**：Node.js 18+、pnpm 9+、[Rust](https://www.rust-lang.org/tools/install)、Windows [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)

```bash
git clone https://github.com/MidiAug/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm tauri dev
```

- debug 默认端口 **3081**（正式包 **3080**；占用时自动顺延）  
- 发行构建：`pnpm check:release` → `pnpm tauri build`（自更新签名需设置 `TAURI_SIGNING_PRIVATE_KEY`，见 Tauri 文档）

更多细节：[docs/getting-started.md](docs/getting-started.md)

## 运行时架构

```text
deepseek-harness-desktop（Tauri 2）
├── 壳 chrome：顶栏 / 设置 / 关于 / 托盘 / 首跑向导
├── 主区 iframe → http://127.0.0.1:<port>  官方 Web UI
└── 平台子 WebView → platform.deepseek.com（API 控制台）

AppData/com.deepseek.harness.desktop/
├── runtime/          托管 Node
├── harness/          托管 @deepseek-ai/dsh
└── settings.json · ui.json · logs/

~/.dsh/               用户数据（默认与官方 CLI 互通）
├── settings.yaml     语言 / 主题真源
├── sessions/ · plugins/ …
```

## 不是什么

- 不是 Electron 换皮聊天客户端，也不是 IDE  
- 不 patch `@deepseek-ai/*` 换 UI  
- 不替你管理 nvm 多版本 Node；探测失败会回落托管或明示错误  

## Harness 安装方式

首跑时选择 **本机已安装**（`system`）或 **应用内安装**（`hosted`）。  
可在 **设置 → 本地服务 → 使用哪份 Harness** 切换。  
本机模式下壳 **不会** 用 npm 改写你的全局 dsh 包。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/getting-started.md](docs/getting-started.md) | 安装、首跑、开发者构建 |
| [docs/configuration.md](docs/configuration.md) | 代理、镜像、外观、数据目录 |
| [docs/troubleshooting.md](docs/troubleshooting.md) | 常见失败与处理 |
| [docs/releases.md](docs/releases.md) | 壳自更新与 Release |

## 与上游的关系

DeepSeek Harness 及其依赖遵循各自上游许可与商标政策。  
**deepseek-harness-desktop** 是独立的社区桌面宿主，由 [@MidiAug](https://github.com/MidiAug) 维护。

## License

[MIT](LICENSE)
