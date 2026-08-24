# 壳自更新

发行构建使用 Tauri updater：启动后检查、每 6 小时轮询、后台下载、**用户确认后**重启安装。

## 行为

| 时机 | 行为 |
|------|------|
| 启动后 15–30s | 自动检查；有更新则后台下载 |
| 每 6 小时 | 同上 |
| 下载完成 | 顶栏横幅 + 关于区「立即重启安装」 |
| 用户确认 | 停托管进程 → 安装 → 重启 |
| 开发态 | 不自动检查；关于区说明通道仅发行构建可用 |

## 单实例

二次启动聚焦已有主窗，避免双开抢端口或 AppData 冲突。

## 更新与数据安全

- **壳自更新**只替换程序与 AppData 内托管 `runtime`/`harness`；**不删除** `$DSH_HOME`（默认 `~/.dsh`）  
- 若使用自定义 `DSH_HOME` 或自定义安装路径，更新前请确认未手动把用户数据目录与程序目录混装  

## Harness 更新（与壳更新分开）

壳设置 → **关于**：

- **检查 harness 更新**：按当前镜像/代理查询 npm registry  
- **更新并重启**：强制重装 `@deepseek-ai/dsh@latest` 并重启托管进程  

Harness 更新走 npm，与壳 MSI 自更新是两条独立通道。详见 [configuration.md](configuration.md)。

## 内置 Node

发行包托管 **Node v22.22.0**（与壳下载逻辑一致）。

## 下载新版本

安装包与更新元数据发布在 [GitHub Releases](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)。
