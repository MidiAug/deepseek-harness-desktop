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
| 用户确认 | `install` + `relaunch`（Windows 会先退出再装） |
| 开发态 | 不自动检查；关于区说明通道仅发行构建可用 |
