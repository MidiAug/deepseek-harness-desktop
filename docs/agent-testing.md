# Agent 交互式调试（Tauri MCP）

> 让 Cursor 等 AI Agent **直接操作你正在运行的 dev 应用**（截图、点击、查 IPC），用于结对排查问题——**不是**跑自动化测试脚本。

## 谁用

| 角色 | 做什么 |
|------|--------|
| **开发者（你）** | 本地 `pnpm tauri dev` 保持运行；在 Cursor 里描述现象，让 Agent 复现/截图/查日志 |
| **Cursor Agent** | 通过 MCP 工具连 WebSocket → 真实 WebView；配合终端 `[ui::ipc]` / `[shell::ops]` 日志做全链路判断 |
| **Release 用户** | **不涉及** — bridge 插件仅 debug 构建注册 |

## 前置

- Node.js 20+
- 本仓库已集成 `tauri-plugin-mcp-bridge`（B52，`debug` 自动启用）
- **首次集成 bridge 后**，须先完整编过一次 debug 二进制（`cargo build` 或跑一次 `pnpm tauri dev`），再连 MCP；否则插件未进二进制，易出现连接/权限类报错
- Cursor 已启用本项目 MCP（见下）

## 一次性：启用 Cursor MCP

项目已含 [`.cursor/mcp.json`](../.cursor/mcp.json)。若 Cursor 未自动加载：

1. **Cursor Settings → MCP**，确认存在 `tauri` server；或
2. 手动添加：

```json
{
  "mcpServers": {
    "tauri": {
      "command": "npx",
      "args": ["-y", "@hypothesi/tauri-mcp-server"]
    }
  }
}
```

改完后**重启 Cursor** 或 Reload MCP。

## 日常怎么用

```text
终端 1（保持运行）          Cursor Agent
─────────────────          ─────────────
pnpm tauri dev      ←──→   「打开设置并截图」
                           「监控 IPC，我点一下主题切换」
                           「manage_window list，看 main / platform-content」
```

1. 终端跑 `pnpm tauri dev`（debug 构建）
2. 在 Cursor Agent 对话里描述要查的行为
3. Agent 会调用 MCP 工具，例如：
   - `driver_session` — 建立自动化会话
   - `webview_screenshot` / `webview_dom_snapshot` — 看 UI
   - `webview_interact` — 点击、滚动
   - `ipc_monitor` + `ipc_get_captured` — 看 Tauri invoke
   - `read_logs` — WebView 控制台
4. 可同时让 Agent 读 Cursor 终端输出（`terminals/*.txt`）对照 B51 结构化日志

**Windows 注意**：`read_logs` 的 `system` 源依赖 macOS `log` CLI，在 Windows 上请直接读 `%LocalAppData%/com.deepseek.harness.desktop/logs/shell.log`，或让 Agent 调用 `export_diagnostics` 后查看 `ops-recent.jsonl`。若 `webview_interact` 的 ref 点击失败，可用 `webview_execute_js` 或 `strategy: text` 替代。

**导出诊断（MCP）**：`ipc_execute_command` 不支持全部 invoke；可用 `webview_execute_js` 调用 `window.__TAURI__.core.invoke('export_diagnostics')`（可先 `set_diagnostics_context`）。验收 ops 链时用 `grep op_id=…` 对照 `shell.log` 与 `ops-recent.jsonl`。

## 截图落盘（可选）

`webview_screenshot` 的 `filePath` **每次调用单独指定**；上游 MCP **没有**全局默认输出目录（仅支持 `TAURI_MCP_SCREENSHOT_MAX_WIDTH` 等环境变量）。

| 场景 | 做法 |
|------|------|
| 结对排查、Agent 直接看图 | **不传** `filePath`，工具返回 base64，对话内可见 |
| 需要本地留存、对比前后状态 | 写到 **`.tauri-mcp/`**，文件名带时间戳，避免覆盖 |

推荐命名：`.tauri-mcp/screenshot-YYYYMMDD-HHmmss.jpg`（例：`.tauri-mcp/screenshot-20260826-222649.jpg`）。

该目录已在 `.gitignore`，**勿**写到 `.cursor/` 或仓库其它 tracked 路径。

## 多 WebView 提示

本应用有 `main`（Shell）与 `platform-content`（DeepSeek 平台 iframe 窗）。跨边界问题时，让 Agent 先用 `manage_window`（`action: list`）确认 `windowId`，再对目标 WebView 操作。

Harness 主区在 `main` 内 iframe（loopback 端口）；Shell 设置/顶栏在 `main` 自身 DOM。

## 安全说明

- MCP Bridge **仅 debug 构建**注册；发行版无 WebSocket 监听
- 仅在本地开发机使用；勿对不可信页面开放远程调试
- Agent 不得借此给 Harness iframe 开通用 FS/Shell（产品红线不变）

## 故障排查

| 现象 | 检查 |
|------|------|
| Cursor 无 Tauri 工具 | MCP 配置 + 重启 Cursor |
| Connection failed | 应用是否在跑；是否已 `cargo build` / `pnpm tauri dev` 编过 debug；终端有无 bridge 报错 |
| 点不到元素 | 用 `webview_select_element`（Alt+Shift+点）或 `webview_dom_snapshot` 找 ref |

上游文档：[Hypothesi MCP Server Tauri](https://hypothesi.github.io/mcp-server-tauri/)
