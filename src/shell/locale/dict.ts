export type LocaleKey =
  | "settings.title"
  | "settings.close"
  | "settings.nav"
  | "settings.section.network"
  | "settings.section.window"
  | "settings.section.appearance"
  | "settings.section.runtime"
  | "settings.section.data"
  | "settings.section.about"
  | "settings.language.title"
  | "settings.language.description"
  | "settings.language.aria"
  | "settings.theme.title"
  | "settings.theme.description"
  | "settings.theme.aria"
  | "settings.theme.light"
  | "settings.theme.dark"
  | "settings.theme.system"
  | "settings.compact.title"
  | "settings.compact.description"
  | "settings.compact.aria"
  | "settings.sessionLog.title"
  | "settings.sessionLog.descriptionOn"
  | "settings.sessionLog.descriptionOff"
  | "settings.sessionLog.aria"
  | "settings.hygiene.title"
  | "settings.hygiene.description"
  | "settings.hygiene.aria"
  | "settings.mirror.title"
  | "settings.mirror.description"
  | "settings.mirror.aria"
  | "settings.mirror.domestic"
  | "settings.mirror.official"
  | "settings.mirror.saved"
  | "settings.proxy.title"
  | "settings.proxy.description"
  | "settings.proxy.aria"
  | "settings.proxy.off"
  | "settings.proxy.system"
  | "settings.proxy.custom"
  | "settings.proxy.saved"
  | "settings.proxyUrl.title"
  | "settings.proxyUrl.description"
  | "settings.proxyUrl.saved"
  | "settings.window.title"
  | "settings.window.description"
  | "settings.window.aria"
  | "settings.window.reask"
  | "settings.port.title"
  | "settings.port.description"
  | "settings.port.placeholder"
  | "settings.port.saved"
  | "settings.port.current"
  | "settings.port.currentDesc"
  | "settings.port.copy"
  | "settings.port.openBrowser"
  | "settings.port.stop"
  | "settings.port.restart"
  | "settings.port.copied"
  | "settings.port.opened"
  | "settings.port.stopped"
  | "settings.port.copyFail"
  | "settings.cli.title"
  | "settings.cli.description"
  | "settings.cli.aria"
  | "settings.cli.enabled"
  | "settings.cli.disabled"
  | "settings.cli.shimYes"
  | "settings.cli.shimNo"
  | "settings.cli.pathYes"
  | "settings.cli.pathNo"
  | "settings.data.dshHome.title"
  | "settings.data.dshHome.description"
  | "settings.data.dshHome.placeholder"
  | "settings.data.dshHome.saved"
  | "settings.data.path.dshHome"
  | "settings.data.path.appData"
  | "settings.data.path.logs"
  | "settings.data.reset.title"
  | "settings.data.reset.description"
  | "settings.data.reset.button"
  | "settings.data.reset.confirm"
  | "settings.data.reset.done"
  | "settings.about.name"
  | "settings.about.tag"
  | "settings.about.shellVersion"
  | "settings.about.harness"
  | "settings.about.digest"
  | "settings.about.port"
  | "settings.about.node"
  | "settings.about.ready"
  | "settings.about.installing"
  | "settings.about.notInstalled"
  | "settings.about.nodeMissing"
  | "settings.about.openPlatform"
  | "settings.about.platformHint"
  | "settings.about.checkUpdate"
  | "settings.about.applyUpdate"
  | "settings.about.applyNetwork"
  | "settings.about.checking"
  | "settings.about.upToDate"
  | "settings.about.updateFound"
  | "settings.about.updated"
  | "settings.about.networkRestarted"
  | "settings.hint.checkingUpdate"
  | "settings.hint.networkRestart"
  | "settings.about.shellUpdate.downloaded"
  | "settings.about.shellUpdate.downloading"
  | "settings.about.shellUpdate.unsupported"
  | "settings.about.shellUpdate.idle"
  | "settings.about.shellUpdate.check"
  | "settings.about.shellUpdate.install"
  | "settings.about.shellUpdate.safeHint"
  | "settings.about.progress.busy"
  | "settings.about.progress.idle"
  | "settings.about.harnessUpdating"
  | "settings.about.exportDiagnostics"
  | "settings.about.exportDiagnosticsDone"
  | "settings.about.updateBanner.latest"
  | "contextMenu.copy"
  | "contextMenu.selectAll"
  | "contextMenu.undo"
  | "contextMenu.redo"
  | "contextMenu.cut"
  | "contextMenu.paste"
  | "contextMenu.rename"
  | "contextMenu.deleteWorkspace"
  | "contextMenu.fork"
  | "contextMenu.archive"
  | "contextMenu.copied"
  | "boot.brand"
  | "boot.title.firstRun"
  | "boot.title.repair"
  | "boot.lead.firstRun"
  | "boot.lead.repair"
  | "boot.status.failed"
  | "boot.status.live"
  | "boot.status.working"
  | "boot.steps"
  | "boot.stage.detect"
  | "boot.stage.download-node"
  | "boot.stage.verify-node"
  | "boot.stage.extract-node"
  | "boot.stage.install-dsh"
  | "boot.stage.start"
  | "boot.stage.prepare"
  | "boot.log.title"
  | "boot.log.lineCount"
  | "boot.log.wait"
  | "boot.log.collapse"
  | "boot.log.expand"
  | "boot.technicalDetails"
  | "boot.msg.restart"
  | "boot.msg.ensure"
  | "boot.msg.ready"
  | "boot.msg.failed"
  | "boot.msg.resetting"
  | "boot.msg.resetFailed"
  | "boot.fault.install.title"
  | "boot.fault.install.body"
  | "boot.fault.health.title"
  | "boot.fault.health.body"
  | "boot.fault.spawn.title"
  | "boot.fault.spawn.body"
  | "boot.fault.node.title"
  | "boot.fault.node.body"
  | "boot.fault.harness.title"
  | "boot.fault.harness.body"
  | "boot.fault.default.title"
  | "boot.fault.default.body"
  | "boot.cta.retry"
  | "boot.cta.network"
  | "boot.cta.logs"
  | "boot.cta.reset"
  | "boot.reset.confirm"
  | "boot.msg.harnessUpdated"
  | "chrome.windowControls.aria"
  | "chrome.sessionLog"
  | "chrome.minimize"
  | "chrome.maximize"
  | "chrome.restore"
  | "chrome.close"
  | "chrome.menu.closeAria"
  | "chrome.menu.app"
  | "chrome.menu.help"
  | "chrome.menu.restartUi"
  | "chrome.menu.openDshHome"
  | "chrome.menu.openLogs"
  | "chrome.menu.hideTray"
  | "chrome.menu.quit"
  | "chrome.menu.about"
  | "chrome.menu.platformApi"
  | "chrome.menu.copyVersion"
  | "chrome.conn.failed"
  | "chrome.conn.preparing"
  | "chrome.productName"
  | "chrome.platform.back"
  | "chrome.platform.title"
  | "chrome.updateBanner.downloaded"
  | "chrome.updateBanner.newVersion"
  | "closeAsk.title"
  | "closeAsk.lead"
  | "closeAsk.remember"
  | "closeAsk.rememberHint"
  | "closeAsk.toTray"
  | "closeAsk.quit"
  | "closeAsk.cancel"
  | "tray.open"
  | "tray.quit";

export type LocaleDict = Record<LocaleKey, string>;

export const zh: LocaleDict = {
  "settings.title": "壳设置",
  "settings.close": "关闭",
  "settings.nav": "设置分区",
  "settings.section.network": "网络",
  "settings.section.window": "窗口",
  "settings.section.appearance": "外观",
  "settings.section.runtime": "运行时",
  "settings.section.data": "数据与诊断",
  "settings.section.about": "关于",
  "settings.language.title": "语言",
  "settings.language.description":
    "与 DeepSeek Harness 共用同一偏好（~/.dsh/settings.yaml）。任一侧修改，另一侧同步。",
  "settings.language.aria": "语言",
  "settings.theme.title": "主题",
  "settings.theme.description":
    "与 DeepSeek Harness 共用同一偏好（~/.dsh/settings.yaml）。任一侧修改，另一侧同步。",
  "settings.theme.aria": "主题",
  "settings.theme.light": "浅色",
  "settings.theme.dark": "深色",
  "settings.theme.system": "跟随系统",
  "settings.compact.title": "简洁模式",
  "settings.compact.description":
    "透明顶栏叠在官方 UI 上（左侧随侧栏、右侧可拖）；窗控悬停显现",
  "settings.compact.aria": "简洁模式",
  "settings.sessionLog.title": "隐藏官方 Session log",
  "settings.sessionLog.descriptionOn":
    "隐藏右上官方按钮，改用顶栏下载（与原按钮相同）",
  "settings.sessionLog.descriptionOff": "仅在简洁模式下生效",
  "settings.sessionLog.aria": "隐藏官方 Session log",
  "settings.hygiene.title": "减少误选界面文字",
  "settings.hygiene.description":
    "拖选或全选对话时，尽量不带上侧栏、时间戳、按钮提示和输入区控件；聊天正文与代码块仍可正常复制。",
  "settings.hygiene.aria": "减少误选界面文字",
  "settings.mirror.title": "镜像",
  "settings.mirror.description": "影响 Node 下载与 npm registry；下次安装或更新时生效",
  "settings.mirror.aria": "镜像",
  "settings.mirror.domestic": "国内（npmmirror）",
  "settings.mirror.official": "官方（nodejs.org / npmjs）",
  "settings.mirror.saved": "镜像已保存；下次安装或更新 harness 时生效。",
  "settings.proxy.title": "代理",
  "settings.proxy.description": "作用于壳下载、npm 与托管 dsh 子进程",
  "settings.proxy.aria": "代理",
  "settings.proxy.off": "关闭（直连）",
  "settings.proxy.system": "系统代理",
  "settings.proxy.custom": "自定义 URL",
  "settings.proxy.saved": "代理已保存。运行中进程需在「关于」中重启以立即生效。",
  "settings.proxyUrl.title": "代理 URL",
  "settings.proxyUrl.description": "例如 http://127.0.0.1:7890 或 socks5://…",
  "settings.proxyUrl.saved": "代理 URL 已保存。运行中进程需重启以立即生效。",
  "settings.window.title": "关闭窗口时最小化到托盘",
  "settings.window.description": "关闭时会记住此选择；也可用下方按钮下次再询问",
  "settings.window.aria": "关闭窗口时最小化到托盘",
  "settings.window.reask": "下次关闭时重新询问",
  "settings.port.title": "首选端口",
  "settings.port.description":
    "0 或留空 = 壳默认（开发 3081 / 发行 3080）；被占用时自动顺延。改后需重启 harness。",
  "settings.port.placeholder": "默认",
  "settings.port.saved": "首选端口已保存；请在下方重启 harness 后生效。",
  "settings.port.current": "当前端口",
  "settings.port.currentDesc": "实际监听端口（可能因占用顺延）",
  "settings.port.copy": "复制服务 URL",
  "settings.port.openBrowser": "浏览器打开",
  "settings.port.stop": "停止 harness",
  "settings.port.restart": "重启 harness",
  "settings.port.copied": "已复制服务 URL。",
  "settings.port.opened": "已在浏览器打开。",
  "settings.port.stopped": "已请求停止 harness。",
  "settings.port.copyFail": "复制失败",
  "settings.cli.title": "命令行 dsh",
  "settings.cli.description":
    "在 AppData/bin 写入 dsh.cmd 并加入用户 PATH（不修改 .bashrc/.zshrc）。新开终端生效。",
  "settings.cli.aria": "命令行 dsh",
  "settings.cli.enabled": "已启用 CLI；请新开终端验证 dsh。",
  "settings.cli.disabled": "已关闭 CLI 并移出用户 PATH。",
  "settings.cli.shimYes": "已写入",
  "settings.cli.shimNo": "未写入",
  "settings.cli.pathYes": "已注册",
  "settings.cli.pathNo": "未注册",
  "settings.data.dshHome.title": "DSH_HOME 覆盖",
  "settings.data.dshHome.description": "留空 = ~/.dsh；下次启动 harness 时生效",
  "settings.data.dshHome.placeholder": "例如 D:\\data\\dsh-home",
  "settings.data.dshHome.saved": "DSH_HOME 覆盖已保存；下次启动生效。",
  "settings.data.path.dshHome": "DSH_HOME",
  "settings.data.path.appData": "AppData",
  "settings.data.path.logs": "日志",
  "settings.data.reset.title": "重置托管运行时",
  "settings.data.reset.description":
    "清除 AppData 下的 harness 并重新安装；保留已下载的 Node；不会删除 DSH_HOME / ~/.dsh 会话与插件",
  "settings.data.reset.button": "重置托管运行时",
  "settings.data.reset.confirm":
    "将清除本机托管的 harness 安装并重新下载（保留 Node；不删除 ~/.dsh）。继续？",
  "settings.data.reset.done": "托管运行时已重置并重新启动。",
  "settings.about.name": "deepseek-harness-desktop",
  "settings.about.tag": "DeepSeek Harness 桌面版",
  "settings.about.shellVersion": "壳版本",
  "settings.about.harness": "harness",
  "settings.about.digest": "digest",
  "settings.about.port": "端口",
  "settings.about.node": "Node",
  "settings.about.ready": "就绪",
  "settings.about.installing": "安装中…",
  "settings.about.notInstalled": "未安装",
  "settings.about.nodeMissing": "未装",
  "settings.about.openPlatform": "打开 DeepSeek API 平台",
  "settings.about.platformHint":
    "在主窗口顶栏下以子 WebView 打开 platform.deepseek.com；顶栏可返回官方 UI。",
  "settings.about.checkUpdate": "检查 harness 更新",
  "settings.about.applyUpdate": "更新并重启",
  "settings.about.applyNetwork": "应用网络设置并重启 harness",
  "settings.about.checking": "正在检查更新…",
  "settings.about.upToDate": "已是最新 harness。",
  "settings.about.updateFound": "发现新版本",
  "settings.about.updated": "harness 已更新并重启。",
  "settings.about.networkRestarted": "已按当前网络设置重启 harness。",
  "settings.hint.checkingUpdate": "正在检查更新…",
  "settings.hint.networkRestart": "正在按当前网络设置重启 harness…",
  "settings.about.shellUpdate.downloaded":
    "壳 {version} 已下载，可立即重启安装。",
  "settings.about.shellUpdate.downloading": "正在下载壳更新",
  "settings.about.shellUpdate.unsupported":
    "壳更新：开发态或未配置发行端点时不可用；发行构建将自动检查（启动后 / 每 6 小时），下完再提示安装。",
  "settings.about.shellUpdate.idle":
    "壳更新：启动后与每 6 小时自动检查；有新版本后台下载，确认后重启安装。详细进度写入 AppData/logs/shell.log。",
  "settings.about.shellUpdate.check": "检查壳更新",
  "settings.about.shellUpdate.install": "立即重启安装壳",
  "settings.about.shellUpdate.safeHint":
    "壳更新只替换程序文件，不会删除 DSH_HOME 或自定义安装目录下的用户数据。",
  "settings.about.progress.busy": "处理中…",
  "settings.about.progress.idle": "最近进度",
  "settings.about.updateBanner.latest": "有可用更新",
  "settings.about.harnessUpdating":
    "已开始更新：停止进程 → 安装 → 重启（可能需数分钟）…",
  "settings.about.exportDiagnostics": "导出诊断",
  "settings.about.exportDiagnosticsDone": "诊断已导出至：{path}",
  "contextMenu.copy": "复制",
  "contextMenu.selectAll": "选择全部",
  "contextMenu.undo": "撤销",
  "contextMenu.redo": "恢复",
  "contextMenu.cut": "剪切",
  "contextMenu.paste": "粘贴",
  "contextMenu.rename": "重命名",
  "contextMenu.deleteWorkspace": "删除工作区",
  "contextMenu.fork": "分叉会话",
  "contextMenu.archive": "归档会话",
  "contextMenu.copied": "已复制",
  "boot.brand": "deepseek-harness-desktop",
  "boot.title.firstRun": "首次准备",
  "boot.title.repair": "修复安装",
  "boot.lead.firstRun": "安装托管 Node 与 harness 后自动打开官方界面。",
  "boot.lead.repair": "上次更新可能中断，正在补全托管 harness 入口后启动。",
  "boot.status.failed": "失败",
  "boot.status.live": "实时状态",
  "boot.status.working": "进行中",
  "boot.steps": "准备步骤",
  "boot.stage.detect": "检测",
  "boot.stage.download-node": "下载 Node",
  "boot.stage.verify-node": "校验",
  "boot.stage.extract-node": "解压",
  "boot.stage.install-dsh": "安装 harness",
  "boot.stage.start": "启动",
  "boot.stage.prepare": "准备",
  "boot.log.title": "过程日志",
  "boot.log.lineCount": "{n} 行 · ",
  "boot.log.wait": "等待进度…",
  "boot.log.collapse": "收起",
  "boot.log.expand": "展开",
  "boot.technicalDetails": "技术详情",
  "boot.msg.restart": "正在重启官方 UI…",
  "boot.msg.ensure": "正在确保 Node / harness 并启动…",
  "boot.msg.ready": "服务已就绪",
  "boot.msg.failed": "启动失败",
  "boot.msg.resetting": "正在重置托管运行时…",
  "boot.msg.resetFailed": "重置失败",
  "boot.fault.install.title": "安装失败",
  "boot.fault.install.body":
    "下载 Node 或 harness 时出错，常见于网络、镜像或代理设置。可打开日志查看详情。",
  "boot.fault.health.title": "服务未就绪",
  "boot.fault.health.body":
    "进程已启动但官方 UI 在时限内未返回 HTTP 200，可能端口被占或插件卡死。",
  "boot.fault.spawn.title": "无法启动 harness",
  "boot.fault.spawn.body":
    "dsh 进程未能监听端口，常见于端口占用或 harness 损坏。",
  "boot.fault.node.title": "缺少 Node 运行时",
  "boot.fault.node.body": "托管 Node 未安装或安装不完整，可重试或重置运行时。",
  "boot.fault.harness.title": "缺少 harness 入口",
  "boot.fault.harness.body":
    "托管 harness 入口文件缺失，可能半安装或更新中断，建议重置 harness。",
  "boot.fault.default.title": "启动失败",
  "boot.fault.default.body": "请查看下方技术详情，或重试 / 打开日志。",
  "boot.cta.retry": "重试",
  "boot.cta.network": "去设置网络",
  "boot.cta.logs": "打开日志",
  "boot.cta.reset": "重置托管运行时",
  "boot.reset.confirm":
    "将清除本机托管的 harness 安装并重新下载（保留已下载的 Node；不会删除 ~/.dsh 会话与插件）。继续？",
  "boot.msg.harnessUpdated": "更新完成",
  "chrome.windowControls.aria": "窗口控制",
  "chrome.sessionLog": "下载 Session log",
  "chrome.minimize": "最小化",
  "chrome.maximize": "最大化",
  "chrome.restore": "还原",
  "chrome.close": "关闭",
  "chrome.menu.closeAria": "关闭菜单",
  "chrome.menu.app": "应用",
  "chrome.menu.help": "帮助",
  "chrome.menu.restartUi": "重启官方 UI",
  "chrome.menu.openDshHome": "打开 DSH_HOME",
  "chrome.menu.openLogs": "打开日志目录",
  "chrome.menu.hideTray": "隐藏到托盘",
  "chrome.menu.quit": "退出",
  "chrome.menu.about": "关于",
  "chrome.menu.platformApi": "DeepSeek API 平台",
  "chrome.menu.copyVersion": "复制版本信息",
  "chrome.conn.failed": "启动失败",
  "chrome.conn.preparing": "准备中",
  "chrome.productName": "DeepSeek Harness",
  "chrome.platform.back": "返回",
  "chrome.platform.title": "DeepSeek 开放平台",
  "chrome.updateBanner.downloaded": "壳 {version} 已下载完成，重启后安装",
  "chrome.updateBanner.newVersion": "新版本",
  "closeAsk.title": "关闭窗口",
  "closeAsk.lead": "关闭时希望怎么做？官方 UI 服务可在托盘后台继续运行。",
  "closeAsk.remember": "记住为我的默认选择",
  "closeAsk.rememberHint": "之后可在壳设置 → 窗口 中修改",
  "closeAsk.toTray": "最小化到托盘",
  "closeAsk.quit": "直接退出",
  "closeAsk.cancel": "取消",
  "tray.open": "打开窗口",
  "tray.quit": "退出",
};

export const en: LocaleDict = {
  "settings.title": "Shell settings",
  "settings.close": "Close",
  "settings.nav": "Settings sections",
  "settings.section.network": "Network",
  "settings.section.window": "Window",
  "settings.section.appearance": "Appearance",
  "settings.section.runtime": "Runtime",
  "settings.section.data": "Data & diagnostics",
  "settings.section.about": "About",
  "settings.language.title": "Language",
  "settings.language.description":
    "Shared with DeepSeek Harness (~/.dsh/settings.yaml). Changes sync both ways.",
  "settings.language.aria": "Language",
  "settings.theme.title": "Theme",
  "settings.theme.description":
    "Shared with DeepSeek Harness (~/.dsh/settings.yaml). Changes sync both ways.",
  "settings.theme.aria": "Theme",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.theme.system": "Follow system",
  "settings.compact.title": "Compact mode",
  "settings.compact.description":
    "Transparent title bar over the official UI (sidebar-aware left, draggable right; window controls on hover)",
  "settings.compact.aria": "Compact mode",
  "settings.sessionLog.title": "Hide official Session log",
  "settings.sessionLog.descriptionOn":
    "Hide the official top-right button; download from the title bar instead",
  "settings.sessionLog.descriptionOff": "Only applies in compact mode",
  "settings.sessionLog.aria": "Hide official Session log",
  "settings.hygiene.title": "Reduce accidental UI text selection",
  "settings.hygiene.description":
    "When selecting or selecting all in chat, avoid sidebar, timestamps, tooltips, and input chrome; message body and code blocks still copy normally.",
  "settings.hygiene.aria": "Reduce accidental UI text selection",
  "settings.mirror.title": "Mirror",
  "settings.mirror.description":
    "Affects Node downloads and npm registry; applies on next install or update",
  "settings.mirror.aria": "Mirror",
  "settings.mirror.domestic": "Domestic (npmmirror)",
  "settings.mirror.official": "Official (nodejs.org / npmjs)",
  "settings.mirror.saved": "Mirror saved; applies on next harness install or update.",
  "settings.proxy.title": "Proxy",
  "settings.proxy.description": "Applies to shell downloads, npm, and the supervised dsh process",
  "settings.proxy.aria": "Proxy",
  "settings.proxy.off": "Off (direct)",
  "settings.proxy.system": "System proxy",
  "settings.proxy.custom": "Custom URL",
  "settings.proxy.saved":
    "Proxy saved. Restart harness from About to apply to a running process.",
  "settings.proxyUrl.title": "Proxy URL",
  "settings.proxyUrl.description": "e.g. http://127.0.0.1:7890 or socks5://…",
  "settings.proxyUrl.saved": "Proxy URL saved. Restart harness to apply immediately.",
  "settings.window.title": "Minimize to tray when closing",
  "settings.window.description":
    "Your choice is remembered; use the button below to ask again next time",
  "settings.window.aria": "Minimize to tray when closing",
  "settings.window.reask": "Ask again on next close",
  "settings.port.title": "Preferred port",
  "settings.port.description":
    "0 or empty = shell default (dev 3081 / release 3080); auto-increments if busy. Restart harness after change.",
  "settings.port.placeholder": "Default",
  "settings.port.saved": "Preferred port saved; restart harness below to apply.",
  "settings.port.current": "Current port",
  "settings.port.currentDesc": "Actual listen port (may differ if busy)",
  "settings.port.copy": "Copy service URL",
  "settings.port.openBrowser": "Open in browser",
  "settings.port.stop": "Stop harness",
  "settings.port.restart": "Restart harness",
  "settings.port.copied": "Service URL copied.",
  "settings.port.opened": "Opened in browser.",
  "settings.port.stopped": "Stop harness requested.",
  "settings.port.copyFail": "Copy failed",
  "settings.cli.title": "CLI dsh",
  "settings.cli.description":
    "Writes dsh.cmd under AppData/bin and adds it to user PATH (does not edit shell rc). New terminals only.",
  "settings.cli.aria": "CLI dsh",
  "settings.cli.enabled": "CLI enabled; open a new terminal and run dsh.",
  "settings.cli.disabled": "CLI disabled and removed from user PATH.",
  "settings.cli.shimYes": "written",
  "settings.cli.shimNo": "not written",
  "settings.cli.pathYes": "registered",
  "settings.cli.pathNo": "not registered",
  "settings.data.dshHome.title": "DSH_HOME override",
  "settings.data.dshHome.description": "Empty = ~/.dsh; applies on next harness start",
  "settings.data.dshHome.placeholder": "e.g. D:\\data\\dsh-home",
  "settings.data.dshHome.saved": "DSH_HOME override saved; applies on next start.",
  "settings.data.path.dshHome": "DSH_HOME",
  "settings.data.path.appData": "AppData",
  "settings.data.path.logs": "Logs",
  "settings.data.reset.title": "Reset hosted runtime",
  "settings.data.reset.description":
    "Clears harness under AppData and reinstalls; keeps downloaded Node; does not delete DSH_HOME sessions/plugins",
  "settings.data.reset.button": "Reset hosted runtime",
  "settings.data.reset.confirm":
    "This clears the hosted harness install and downloads again (keeps Node; does not delete ~/.dsh). Continue?",
  "settings.data.reset.done": "Hosted runtime reset and restarted.",
  "settings.about.name": "deepseek-harness-desktop",
  "settings.about.tag": "DeepSeek Harness desktop",
  "settings.about.shellVersion": "Shell version",
  "settings.about.harness": "harness",
  "settings.about.digest": "digest",
  "settings.about.port": "Port",
  "settings.about.node": "Node",
  "settings.about.ready": "Ready",
  "settings.about.installing": "Installing…",
  "settings.about.notInstalled": "Not installed",
  "settings.about.nodeMissing": "Missing",
  "settings.about.openPlatform": "Open DeepSeek API platform",
  "settings.about.platformHint":
    "Opens platform.deepseek.com in a child WebView under the title bar; use Back to return to the official UI.",
  "settings.about.checkUpdate": "Check harness update",
  "settings.about.applyUpdate": "Update and restart",
  "settings.about.applyNetwork": "Apply network settings and restart harness",
  "settings.about.checking": "Checking for updates…",
  "settings.about.upToDate": "Harness is up to date.",
  "settings.about.updateFound": "Update available",
  "settings.about.updated": "Harness updated and restarted.",
  "settings.about.networkRestarted": "Harness restarted with current network settings.",
  "settings.hint.checkingUpdate": "Checking for updates…",
  "settings.hint.networkRestart": "Restarting harness with current network settings…",
  "settings.about.shellUpdate.downloaded":
    "Shell {version} downloaded. Restart to install.",
  "settings.about.shellUpdate.downloading": "Downloading shell update",
  "settings.about.shellUpdate.unsupported":
    "Shell auto-update is unavailable in dev builds or without a release endpoint.",
  "settings.about.shellUpdate.idle":
    "Shell updates check on start and every 6 hours; downloads in background. See AppData/logs/shell.log.",
  "settings.about.shellUpdate.check": "Check shell update",
  "settings.about.shellUpdate.install": "Restart to install shell",
  "settings.about.shellUpdate.safeHint":
    "Shell updates replace app files only. They do not delete DSH_HOME or data in a custom install location.",
  "settings.about.progress.busy": "Working…",
  "settings.about.progress.idle": "Recent progress",
  "settings.about.updateBanner.latest": "Update available",
  "settings.about.harnessUpdating":
    "Update started: stop → install → restart (may take several minutes)…",
  "settings.about.exportDiagnostics": "Export diagnostics",
  "settings.about.exportDiagnosticsDone": "Diagnostics exported to: {path}",
  "contextMenu.copy": "Copy",
  "contextMenu.selectAll": "Select All",
  "contextMenu.undo": "Undo",
  "contextMenu.redo": "Redo",
  "contextMenu.cut": "Cut",
  "contextMenu.paste": "Paste",
  "contextMenu.rename": "Rename",
  "contextMenu.deleteWorkspace": "Delete workspace",
  "contextMenu.fork": "Fork conversation",
  "contextMenu.archive": "Archive conversation",
  "contextMenu.copied": "Copied",
  "boot.brand": "deepseek-harness-desktop",
  "boot.title.firstRun": "First-time setup",
  "boot.title.repair": "Repair install",
  "boot.lead.firstRun":
    "Installs managed Node and harness, then opens the official UI.",
  "boot.lead.repair":
    "A prior update may have interrupted; completing the harness install.",
  "boot.status.failed": "Failed",
  "boot.status.live": "Live status",
  "boot.status.working": "In progress",
  "boot.steps": "Setup steps",
  "boot.stage.detect": "Detect",
  "boot.stage.download-node": "Download Node",
  "boot.stage.verify-node": "Verify",
  "boot.stage.extract-node": "Extract",
  "boot.stage.install-dsh": "Install harness",
  "boot.stage.start": "Start",
  "boot.stage.prepare": "Prepare",
  "boot.log.title": "Process log",
  "boot.log.lineCount": "{n} lines · ",
  "boot.log.wait": "Waiting for progress…",
  "boot.log.collapse": "Collapse",
  "boot.log.expand": "Expand",
  "boot.technicalDetails": "Technical details",
  "boot.msg.restart": "Restarting official UI…",
  "boot.msg.ensure": "Ensuring Node / harness and starting…",
  "boot.msg.ready": "Service ready",
  "boot.msg.failed": "Start failed",
  "boot.msg.resetting": "Resetting hosted runtime…",
  "boot.msg.resetFailed": "Reset failed",
  "boot.fault.install.title": "Install failed",
  "boot.fault.install.body":
    "Could not download Node or harness—often network, mirror, or proxy. Check logs for details.",
  "boot.fault.health.title": "Service not ready",
  "boot.fault.health.body":
    "Process started but the official UI did not return HTTP 200 in time—port conflict or plugin hang.",
  "boot.fault.spawn.title": "Could not start harness",
  "boot.fault.spawn.body":
    "dsh did not listen on a port—often port in use or damaged harness.",
  "boot.fault.node.title": "Node runtime missing",
  "boot.fault.node.body":
    "Managed Node is missing or incomplete. Retry or reset the hosted runtime.",
  "boot.fault.harness.title": "Harness entry missing",
  "boot.fault.harness.body":
    "Managed harness entry file is missing—partial install or interrupted update. Reset harness.",
  "boot.fault.default.title": "Start failed",
  "boot.fault.default.body":
    "See technical details below, or retry / open logs.",
  "boot.cta.retry": "Retry",
  "boot.cta.network": "Network settings",
  "boot.cta.logs": "Open logs",
  "boot.cta.reset": "Reset hosted runtime",
  "boot.reset.confirm":
    "Clears the local harness install and re-downloads (keeps Node; does not delete ~/.dsh). Continue?",
  "boot.msg.harnessUpdated": "Update complete",
  "chrome.windowControls.aria": "Window controls",
  "chrome.sessionLog": "Download Session log",
  "chrome.minimize": "Minimize",
  "chrome.maximize": "Maximize",
  "chrome.restore": "Restore",
  "chrome.close": "Close",
  "chrome.menu.closeAria": "Close menu",
  "chrome.menu.app": "App",
  "chrome.menu.help": "Help",
  "chrome.menu.restartUi": "Restart official UI",
  "chrome.menu.openDshHome": "Open DSH_HOME",
  "chrome.menu.openLogs": "Open logs folder",
  "chrome.menu.hideTray": "Hide to tray",
  "chrome.menu.quit": "Quit",
  "chrome.menu.about": "About",
  "chrome.menu.platformApi": "DeepSeek API platform",
  "chrome.menu.copyVersion": "Copy version info",
  "chrome.conn.failed": "Start failed",
  "chrome.conn.preparing": "Preparing",
  "chrome.productName": "DeepSeek Harness",
  "chrome.platform.back": "Back",
  "chrome.platform.title": "DeepSeek Open Platform",
  "chrome.updateBanner.downloaded":
    "Shell {version} downloaded. Restart to install.",
  "chrome.updateBanner.newVersion": "new version",
  "closeAsk.title": "Close window",
  "closeAsk.lead":
    "What should happen when you close? The official UI service can keep running in the tray.",
  "closeAsk.remember": "Remember as my default",
  "closeAsk.rememberHint": "Change later in Shell settings → Window",
  "closeAsk.toTray": "Minimize to tray",
  "closeAsk.quit": "Quit completely",
  "closeAsk.cancel": "Cancel",
  "tray.open": "Open window",
  "tray.quit": "Quit",
};

export const dicts: Record<"zh" | "en", LocaleDict> = { zh, en };
