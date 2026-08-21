# 快速开始

> 状态：B2–B7 起可由壳下载托管 Node + `@deepseek-ai/dsh`，以顶栏 + iframe 打开官方 UI；B6 起壳设置即时落盘，关于区可检查/更新 harness。

## 你需要什么

- Windows 10/11（当前优先）
- 可用网络（首次会下载 Node 与 harness）
- **不需要**预先安装 Node，也不需要会用终端（默认托管路径）

## 默认路径（小白）

1. 安装并打开 deepseek-harness-desktop  
2. 等待壳下载 / 安装托管运行时（首次有步骤与日志；已装好时仅顶中气泡提示）  
3. 主区 iframe 打开官方 Web UI（官方自带进入等待页；壳不再叠全屏「加载中」）；顶栏可开壳设置  
4. 需要代理或镜像时，点顶栏齿轮或「视图 → 壳设置」  

关闭应用后，由本壳托管的 `node` / `dsh` 进程应被回收；若曾异常退出，下次启动会做清扫。

## 开发者自检

```bash
pnpm install
pnpm tauri dev
```

- debug 默认端口 **3081**（避开官方 3080；若被占用会自动顺延并在日志中提示）  
- 启动日志：`%APPDATA%\com.deepseek.harness.desktop\logs\harness.log`  
- 托管程序目录：`%APPDATA%\com.deepseek.harness.desktop\{runtime,harness}`  
- 用户数据默认：`%USERPROFILE%\.dsh`  
- 清空托管程序后重装：删除上述 `runtime` / `harness` 再启动（**不要**随便删 `~/.dsh`）  
- 若曾装过其他桌面端，请先结束其残留 `node`（否则可能占 3081 并返回异常状态）  

## 进阶路径

数据目录、代理与版本说明见 [configuration.md](configuration.md)。默认与官方 CLI 共用 `~/.dsh`（会话与插件可复用）；harness **程序**仍由本壳托管与更新。
