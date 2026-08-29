# Changelog

本文件是 **GitHub Release 正文真源**（[Keep a Changelog](https://keepachangelog.com/) 风格）。  
发版前：把 `[Unreleased]` 里的条目挪到新版本节 `## [x.y.z] - YYYY-MM-DD`，再升版本号并打 tag。  
CI 按 tag（如 `v0.1.2`）截取对应节写入 Release Draft。

格式约定：每版可含 `### 中文` / `### English`（或仅一种语言）。

## [Unreleased]

### 中文

- **修复**：壳「检查更新」失败时不再伪装成 idle；Toast 提示已最新 / 发现更新 / 失败
- **改进**：发现更新后静默下载；关于页「更新已就绪」+「重启」；顶栏横幅保留
- **修复**：updater 错误文案不再因 URL 含 `desktop` 被误判为开发态不可用
- **修复**：手装覆盖选「卸载后安装」后，仅剩 `uninstall.exe` 时不再误报安装目录不属于本产品

### English

- **Fix:** Shell update check failures no longer look like “idle / auto-check only”; Toast for up-to-date / found / failed
- **Improve:** Silent download when an update is found; About shows “ready” + **Restart**; title-bar banner kept
- **Fix:** Updater error classification no longer treats `desktop` in the URL as “dev mode”
- **Fix:** After “uninstall then install”, a leftover `uninstall.exe` no longer blocks setup as a foreign folder

## [0.1.1] - 2026-08-29

### 中文

社区维护的 DeepSeek Harness（`dsh`）**桌面宿主**——非 DeepSeek 官方产品。

**请下载：** `DeepSeek Harness Desktop_0.1.1_x64-setup.exe`（NSIS，推荐）。  
若出现 SmartScreen：更多信息 → 仍要运行（暂无 Authenticode 签名）。

- **修复**：启动就绪后偶发二次启动，界面卡在「正在确保…」
- **修复**：启动时探测子进程不再闪黑色控制台窗口
- **改进**：宿主日志落盘路径与「打开日志」一致（`LocalAppData`）；按会话轮转归档
- **其他**：NSIS 安装包使用应用图标；README 双语与产品截图；开发/CI 要求 Node 22+

### English

Community **Tauri desktop host** for DeepSeek Harness (`dsh`) — not an official DeepSeek product.

**Download:** prefer `DeepSeek Harness Desktop_0.1.1_x64-setup.exe` (NSIS).  
Windows may show SmartScreen → More info → Run anyway (no Authenticode yet).

- **Fix:** Avoid a second boot after ready that could leave the UI stuck on “ensuring…”
- **Fix:** Probe/helper processes no longer flash a console window on startup
- **Improve:** Host log path matches “Open logs” (`LocalAppData`); session-based log rotation
- **Other:** NSIS setup uses the app icon; bilingual README + screenshots; Node 22+ for develop/CI

## [0.1.0] - 2026-08-29

### 中文

首发 Windows NSIS 安装包。社区维护的 DeepSeek Harness 桌面宿主——非 DeepSeek 官方产品。

### English

Initial Windows NSIS release. Community Tauri desktop host for DeepSeek Harness — not an official DeepSeek product.
