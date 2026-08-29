# 维护者：如何打发行包

面向要把 **deepseek-harness-desktop** 推上 GitHub Releases 的维护者。  
用户向说明见 [releases.md](releases.md)。

## 前提

| 项 | 说明 |
|----|------|
| 仓库 | `https://github.com/MidiAug/deepseek-harness-desktop`（与 `tauri.conf.json` updater endpoint 一致） |
| 本机密钥 | `.secrets/updater.key` + `.secrets/updater.password`（已 gitignore；**勿提交**） |
| GitHub Secrets（CI） | `TAURI_SIGNING_PRIVATE_KEY`（私钥全文）、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| 工具 | Node 22+（`>=22.12`）、pnpm 9、Rust stable、Windows（打 NSIS） |

**首发主推 NSIS**（`*-setup.exe`）。MSI/WiX 可附带，但**不含**中文双快捷方式与本仓库 NSIS hooks；完整身份体验以 NSIS 为准。  
`bundle.windows.nsis.installerIcon` 须指向 `icons/icon.ico`，否则资源管理器里 setup 会显示默认 NSIS 图标（与应用图标无关）。

## A. 本地打一包（不依赖 CI）

```powershell
pnpm check:release
$env:TAURI_SIGNING_PRIVATE_KEY = (Resolve-Path ".secrets/updater.key").Path
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -Raw ".secrets/updater.password").Trim()
pnpm tauri build
node scripts/generate-latest-json.mjs 0.1.0 v0.1.0
```

产物大致在：

- `src-tauri/target/release/bundle/nsis/*-setup.exe`（+ `.sig`）
- 仓库根 `latest.json`（gitignore，仅上传 Release）

手动建 GitHub Release（tag `v0.1.0`），上传：`*-setup.exe`、`.sig`、`latest.json`；可选附 MSI 与 `SHA256SUMS.txt`。

生成校验和示例：

```powershell
Get-FileHash src-tauri\target\release\bundle\nsis\*-setup.exe -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash.ToLower())  $($_.Path | Split-Path -Leaf)" } |
  Set-Content -Encoding utf8 SHA256SUMS.txt
```

## B. CI 打 tag 发行

1. 仓库 Settings → Secrets 写入上表两个 updater 密钥  
2. 确认 `package.json` / `src-tauri/tauri.conf.json` / `Cargo.toml` 版本一致（如 `0.1.0`）  
3. 推送 tag：`git tag v0.1.0 && git push origin v0.1.0`  
4. 工作流 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 构建 Windows，上传 Release，并生成 updater 用 `latest.json`（**优先 NSIS**）

也可在 Actions 里对 `release.yml` 使用 **workflow_dispatch** 试跑（需已有权限）。

## B2. 仓库「被发现」（About / Topics / Social）

在 GitHub 网页操作（Agent 不代改 Settings）：

| 项 | 建议 |
|----|------|
| **Description** | `DeepSeek Harness for Windows — official UI, reuse local dsh, proxy & mirror built-in` |
| **Website** | `https://github.com/MidiAug/deepseek-harness-desktop/releases/latest` |
| **Topics** | `deepseek` · `deepseek-harness` · `dsh` · `tauri` · `tauri2` · `desktop` · `windows` · `webview2` |
| **Social preview** | 上传 `docs/images/main-ui.png`（或 1280×640 裁切） |

根目录 **README.md** 为中文用户向文案；**README.en.md** 为英文。主叙事：**环境做对 + 官方界面原样**（代理/镜像、复用本机 dsh）；对比用「按你更在意什么选」购物指南，不写「我们更克制」。

## C. 冷装验收（结案必做）

在**干净 Windows 10/11 x64**（无 Node、无旧壳）执行并记录结果：

1. 下载 Release 的 **NSIS setup**，默认路径安装  
2. 首次启动：向导或 fast path → **官方 UI 可见**（≤ 一次网络向导）  
3. 设置 → 关于：壳版本 · harness 版本 · digest 均有值  
4. **导出诊断**：含 `manifest.json`、`shell.log`  
5. 「添加或删除程序」卸载  
6. 卸载后：

| 检查项 | 期望 |
|--------|------|
| 无 `deepseek-harness-desktop.exe` | ✅ |
| 无命令行含 `...\com.deepseek.harness.desktop\harness\` 的 `node.exe` | ✅ |
| `%USERPROFILE%\.dsh` | **不**随壳删除 |

通过后勾选 SCRIPT-b23 步骤 9，并勾 VISION「干净机从安装包到官方 UI」。

## D. 刻意暂缓（非首发阻塞）

- **Authenticode**：无证书时 SmartScreen 会警告；首发可文档说明「仍要运行」  
- **macOS / Linux**：README 已声明尚未支持  
- **portable zip**：非 B23 范围
