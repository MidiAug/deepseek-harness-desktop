# 快速开始

## 你需要什么

- Windows 10/11（当前优先）
- 可用网络（首次会下载 Node 与 harness）
- **不需要**预先安装 Node，也不需要会用终端（默认托管路径）

## 安装包用户

1. 从 [GitHub Releases](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest) 下载 **NSIS**（`*-setup.exe`，推荐）并安装  
2. 打开 deepseek-harness-desktop  
3. **首次启动**：选择「沿用本机 Harness」或「由壳全新准备」，并确认 **DSH_HOME** 数据目录  
4. 等待壳安装/启动运行时（已有本机 dsh 时通常很快）  
5. 主区 iframe 打开官方 Web UI  
6. 需要代理或镜像时，点顶栏齿轮或「视图 → 壳设置」  

关闭应用后，由本壳托管的 `node` / `dsh` 进程应被回收；若曾异常退出，下次启动会做清扫。

## 从源码构建（开发者）

```bash
git clone https://github.com/MidiAug/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm tauri dev
```

- debug 默认端口 **3081**（避开官方 3080；若被占用会自动顺延并在日志中提示）  
- 启动日志：`%APPDATA%\com.deepseek.harness.desktop\logs\harness.log`  
- 托管程序目录：`%APPDATA%\com.deepseek.harness.desktop\{runtime,harness}`  
- 用户数据默认：`%USERPROFILE%\.dsh`  
- 清空托管程序后重装：删除上述 `runtime` / `harness` 再启动（**不要**随便删 `~/.dsh`）  
- 若曾装过其它 Harness 桌面壳，请先结束其残留 `node`（否则可能占 3081 并返回异常状态）  

用 Cursor Agent 对**运行中的应用**做交互式排查（截图、点击、IPC）见 [agent-testing.md](agent-testing.md)（debug 构建 + MCP）。

## 进阶

数据目录、代理与版本说明见 [configuration.md](configuration.md)。默认与官方 CLI 共用 `~/.dsh`（会话与插件可复用）；harness **程序**仍由本壳托管与更新。
