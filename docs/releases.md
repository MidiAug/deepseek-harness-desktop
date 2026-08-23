# 壳发行与自更新

发行构建使用 Tauri updater（对齐 dataelement：启动后检查、每 6 小时、后台下载、**确认后**重启安装）。

## 签名密钥

- 公钥已写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- **私钥**仅存本机 `.secrets/updater.key`（已 gitignore），发布时设置：

```text
TAURI_SIGNING_PRIVATE_KEY_PATH=.secrets/updater.key
```

丢失私钥将无法为旧用户签发更新。

## 发布步骤（摘要）

0. **`pnpm check:release`**（B13：updater 配置、capabilities、壳更新杀树路径）
1. `pnpm tauri build`（会生成 updater artifacts + `.sig`）
2. 上传安装包与签名到 GitHub Release
3. 同 Release 放置 `latest.json`（Tauri static JSON 格式），URL 与 `tauri.conf.json` 的 `endpoints` 一致

当前端点占位：

`https://github.com/deepseek-harness-desktop/deepseek-harness-desktop/releases/latest/download/latest.json`

请在实际仓库就绪后改成真实 owner/repo。

## 行为

| 时机 | 行为 |
|------|------|
| 启动后 15–30s | 自动 `check`；有更新则 `download` |
| 每 6 小时 | 同上 |
| 下载完成 | 顶栏横幅 + 关于区「立即重启安装」 |
| 用户确认 | **`prepare_shell_update`（停托管进程）** → `install` + `relaunch` |
| 开发态 | 不自动检查；关于区说明通道仅发行构建可用 |

## 单实例

二次启动聚焦已有主窗（`tauri-plugin-single-instance`），避免双开抢端口 / AppData。

## 托管 Node 版本（check:release 断言）

NODE_VERSION: v22.22.0

与 `src-tauri/src/paths.rs` 的 `pub const NODE_VERSION` 须一致；发行前 `pnpm check:release` 会校验。

## MSI 冷装验收清单（B23 · 手工 VM）

在**干净 Windows VM**（无 Node、无旧版壳）执行并签字：

1. 下载 Release MSI / 安装包，默认路径完成安装  
2. 首次启动：首跑向导或 fast path → **官方 UI 可见**（≤ 一次网络向导）  
3. 关于页：壳版本 · harness 版本 · digest 均有值  
4. 设置 → 关于 → **导出诊断**：文件夹含 `manifest.json`、`shell.log`  
5. 从「添加或删除程序」卸载  
6. 卸载后检查（允许 AppData 用户数据残留，但不应留**托管**孤儿进程）：

| 检查项 | 期望 |
|--------|------|
| `tasklist` 无 `deepseek-harness-desktop.exe` | ✅ |
| 无命令行含 `...\com.deepseek.harness.desktop\harness\` 的 `node.exe` | ✅ |
| `%APPDATA%\com.deepseek.harness.desktop\runtime` | 卸载可删或文档说明保留策略 |
| `%USERPROFILE%\.dsh` | **不**随壳卸载删除（用户数据） |

## 更新与数据安全

- **壳自更新**只替换程序与 AppData 内托管 `runtime`/`harness`；**不删除** `$DSH_HOME`（默认 `~/.dsh`）  
- 若使用自定义 `DSH_HOME` 或自定义安装路径，更新前请确认未手动把用户数据目录与程序目录混装（见 dataelement #120）  
