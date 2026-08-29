# 使用文档

面向下载与使用 **deepseek-harness-desktop** 的人。

| 文档 | 内容 |
|------|------|
| [getting-started.md](getting-started.md) | 安装、首跑、从源码构建 |
| [configuration.md](configuration.md) | 代理、镜像、运行时来源、外观、数据目录 |
| [troubleshooting.md](troubleshooting.md) | 常见失败与处理 |
| [releases.md](releases.md) | 壳自更新与 Release 下载 |
| [publishing.md](publishing.md) | 维护者：打 NSIS 包、CI tag、CHANGELOG→Draft、冷装验收 |
| 仓库根 [CHANGELOG.md](../CHANGELOG.md) | 用户向版本说明（Release Draft 真源） |
| [images/](images/README.md) | README / Social preview 截图放置说明 |

## 本应用是什么

- **是**：官方 DeepSeek Harness Web UI 的桌面宿主（窗口 + 生命周期 + 网络相关设置）
- **不是**：另一套 Agent / IDE；也不会默认给网页开任意本机文件/Shell 权限

更细的行为以应用内壳设置（含「关于」分区）为准；本文随版本更新。

## 下载

**[GitHub Releases · Windows NSIS](https://github.com/MidiAug/deepseek-harness-desktop/releases/latest)**（`*-setup.exe`）

未签名时 SmartScreen 可能提示 → 更多信息 → 仍要运行。
