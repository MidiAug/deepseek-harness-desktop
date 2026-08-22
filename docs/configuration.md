# 配置

> 状态：B12 — 运行时分区 + 壳自更新（启动/6h、下完再提示安装）。

## 网络

| 项 | 说明 |
|----|------|
| 镜像 | **国内（npmmirror）**（默认）或 **官方（nodejs.org / npmjs）** |
| 代理 | 关闭 / 系统代理 / 自定义 URL（`http://` 或 `socks5://`） |

代理作用于：壳下载 Node、`npm install`、托管 `dsh` 子进程。  
**有镜像 ≠ 已配代理**，二者分开。  
改动**即时写入**；已在跑的 harness 需到「关于」点「应用网络设置并重启 harness」才立刻生效。

持久化（AppData `com.deepseek.harness.desktop`）：

| 文件 | 内容 |
|------|------|
| `settings.json` | 镜像、代理、`DSH_HOME`、关闭行为、首选端口、CLI 开关 |
| `ui.json` | 简洁模式、Session log 顶栏代理、选择洁净 |
| `~/.dsh/settings.yaml` | 与 DSH 共用：`locale.preference`（zh/en）、`ui-theme.preference`（light/dark/system） |

旧版若只有单文件 `settings.json`（含外观字段），首次加载会拆写到两文件。

顶栏中区显示连接状态（含端口）。首选端口可在 **设置 → 运行时** 配置（0 = 默认：debug **3081** / 发行 **3080**；占用时自动顺延）。

设置 → **运行时**：停/启 harness、复制/外开服务 URL、可选将 `dsh` 写入用户 PATH（不改 shell rc）。

首次点关闭会询问「最小化到托盘」或「直接退出」，并可勾选记住默认；之后可在壳设置 → 窗口 中改，或「下次关闭时重新询问」。  
托盘左键打开窗口；真正退出请用托盘「退出」或「应用 → 退出」。

## 外观（壳顶栏）

| 项 | 说明 |
|----|------|
| 语言 | **中文 / English**（与 DeepSeek 设置相同；真源 `~/.dsh/settings.yaml` 的 `locale.preference`）。任一侧修改即同步；壳设置弹窗文案随之切换 |
| 主题 | **浅色 / 深色 / 跟随系统**（与 DeepSeek 外观相同；真源 `~/.dsh/settings.yaml` 的 `ui-theme.preference`）。任一侧修改即同步。非简洁顶栏：浅→白、深→灰；设置弹窗等换肤 |
| 简洁模式 | 透明顶栏叠在官方 UI 上：左侧随侧栏宽、高 25px；右侧高 35px；窗控悬停显现 |
| 隐藏官方 Session log | **简洁模式子项**（默认开）：隐藏右上官方按钮，改用顶栏下载（与原按钮相同） |
| 减少误选界面文字 | **默认关**：拖选或全选时尽量不带上侧栏、时间戳、按钮提示和输入区控件；聊天正文与代码块仍可复制 |

外观改动**即时写入** `ui.json`，无需点保存。网络 / 窗口 / 数据分区同样即时写入 `settings.json`（无「保存」按钮）。

## Harness 来源与更新

本应用 **仅使用壳托管的 harness**（安装到应用数据目录，由本壳获取、监督与更新）。  
不提供「指向本机已有 `dsh`」的自带（BYO）模式。

壳设置 → **关于**：

| 项 | 说明 |
|----|------|
| 版本三元组 | 壳版本 · harness 版本 · digest（package.json SHA-256 前 16 hex） |
| 打开 DeepSeek API 平台 | 主窗口顶栏下子 WebView 打开 `https://platform.deepseek.com`（帮助菜单同入口；顶栏「返回」回官方 UI）。站点禁止 iframe 嵌套，故不用 iframe。 |
| 检查 harness 更新 | 按当前镜像/代理查询 npm registry `latest` |
| 更新并重启 | 强制重装 `@deepseek-ai/dsh@latest` 并重启托管进程 |
| 壳更新 | 启动后与每 6 小时自动检查；后台下载后提示「立即重启安装」。详见 [releases.md](releases.md) |

若你以前用过官方 CLI：默认仍共用 `~/.dsh`，其中的会话与已装插件可被本壳启动的 harness 复用；**程序本身**仍是壳管理的那一份。

## 数据目录

默认与官方一致：`$DSH_HOME` → `~/.dsh`（Windows 上为用户目录下的 `.dsh`）。  
可在设置中填写 **DSH_HOME 覆盖**（留空则用默认）；下次启动生效。  
菜单「应用 → 打开 DSH_HOME」可打开当前数据目录。

卸载桌面端时：默认删除壳的程序与壳配置；**默认保留** `~/.dsh`。
