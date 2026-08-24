# 排查

> 状态：随真实错误文案补充；先列高优先级场景。

## 打不开 / 一直停在准备中

- 检查网络；公司网或需代理时，先到设置里配好再重试（B3）  
- **首次安装 / 修复安装**：步骤横排 + 进度条；过程日志可收起  
- 若提示「不完整 harness」：多为中断的「更新并重启」留下半安装（入口包 `@deepseek-ai/dsh` 缺失）；壳会自动修复重装，属预期而非检测失灵  
- 强制更新改为先备份旧包再安装，失败尽量回滚；仍失败可到首跑失败页或设置「数据与诊断」点 **重置托管运行时**（只清 AppData `harness`，**不删** `~/.dsh`）  
- 也可手动清空 `%APPDATA%\com.deepseek.harness.desktop\harness` 后重试  
- **已有运行时**：应很快看到官方 `HARNESS` 等待页；若只剩顶中气泡不动，看 `%APPDATA%\com.deepseek.harness.desktop\logs\harness.log` 或点「打开日志」  
- 杀软/管控软件是否拦截了 Node 或本机回环端口  
- 开发态：确认 `%AppData%\npm` 在 PATH 上优先于 DeepSeek Harness 假 `pnpm` shim  
- 若提示「运行时忙」：另一实例正在更新/安装；关掉多余窗口（壳为单实例，二次启动应聚焦已有窗）  

## 能开窗但页面空白

- 确认本机 `127.0.0.1` 上 harness 端口已监听（debug 默认 **3081**，正式包 **3080**）  
- 是否误开了其他桌面端占端口；关掉冲突实例后再开  
- 若官方 BootPage（HARNESS）一直转：属 harness 插件加载，不是壳叠层问题  

## 关掉应用后仍有 node / dsh

- 再开一次应用（启动清扫：按 pid 文件 + 端口占用者校验杀孤儿）或结束对应进程后重试  
- 本会话托管进程由壳持有 Windows 进程句柄退出时回收，避免 PID 复用误杀  
- 托管进程命令行应含 `com.deepseek.harness.desktop\harness`  

## npm install 极慢或无输出

- 壳已对 npm 使用 npmmirror + IPv4 优先；若仍失败，检查系统代理 / 防火墙  
- 关于页更新日志应持续出现 npm 行或「仍在执行」心跳；也可打开 `%APPDATA%\com.deepseek.harness.desktop\logs\shell.log`  
- 可点「重置托管运行时」，或手动清空 `%APPDATA%\com.deepseek.harness.desktop\harness` 后点「重试」  

## 下载 Node / 安装包失败

- 壳会对下载自动重试最多 **3** 次（退避约 500ms → 1s → 2s）；失败文案以 `INSTALL_FAILED:` 开头  
- 未完成的文件以 `.partial` 保存，下次可尝试 HTTP Range 续传  
- 仍失败：检查代理/镜像设置，或删掉 `%APPDATA%\com.deepseek.harness.desktop\runtime` 后重试（仅当 Node 本身损坏；重置托管运行时默认保留 runtime）  

## 壳自更新失败

- 确认安装前托管进程已停（壳会先 `prepare_shell_update`）  
- 发行构建须签名；见 [releases.md](./releases.md)；发布前跑 `pnpm check:release`  

## 关于页版本 / digest

- **壳版本** · **harness 版本** · **digest**（package.json SHA-256 前 16 hex）在壳设置 → **关于**（菜单「关于」直达）  
- **求助时导出诊断**：设置 → 关于 → **导出诊断**（版本、脱敏设置、路径摘要、`logs/shell.log` + `logs/harness.log` 尾部、`runtime-status.json`；打开所在文件夹后可打包发送）  
- **开发排障**：`pnpm tauri dev` 时终端会刷 `[shell::*]` / `[harness::out]` 日志；也可开 DevTools（`attachConsole`）看前后端合并流  
- 「检查 harness 更新」走当前镜像/代理的 npm registry；失败时看 `INSTALL_FAILED:` 文案与代理设置  
- 「更新并重启」会停托管进程、移除旧包、强制 `npm install @deepseek-ai/dsh@latest` 再拉起；**可能需数分钟**  
- 关于页会显示**进度条**与**滚动过程日志**（npm 输出按行流式刷新；约 12s 无输出会有心跳提示）  
- 完整记录仍写入 `%APPDATA%\com.deepseek.harness.desktop\logs\shell.log`（与 `harness.log` 分开）  
- 壳更新：发行构建会自动检查；开发态请用发行包或见 [releases.md](releases.md)  

## 代理下插件安装失败

- 确认代理对 **应用本身** 生效，而不仅是浏览器（完整能力在 B3）  
- 镜像与代理都配时，确认失败步骤是「下载壳资源」还是「dsh plugin」  

## 怀疑插件导致无法启动

- 设置 → **数据与诊断** → **干净 profile 启动**：使用 AppData `clean-profile-session` 作临时 `DSH_HOME`，**不删除**你的 `~/.dsh` 与已装插件  
- 启动成功后可在同一分区 **退出干净 profile** 回到正式数据；或从首跑失败页 / 故障恢复 CTA 进入  
- 壳 **重置托管运行时** 只清 AppData `harness`，**不删** `~/.dsh` 内已装插件  
- 若官方 UI 因插件卡死：备份后尝试删除或移走 `%USERPROFILE%\.dsh\plugins`（或你自定义的 `DSH_HOME` 下 `plugins`）再重启  
- 仍失败：设置 → 关于 → **导出诊断**，附 `shell.log` 与 `manifest.json` 求助  
