#!/usr/bin/env node
/**
 * B50 路径身份落盘审计
 *
 * 层级：
 * 1. 静态 — tauri.conf / NSIS hooks 内容
 * 2. Rust 落盘 — temp 目录真实读写（cargo test + path_audit 二进制）
 * 3. 可选 NSIS — 静默安装/卸载 + 开始菜单双快捷方式（--install）
 *
 * 用法：
 *   pnpm audit:path-identity              # 静态 + Rust 落盘（默认，~30s）
 *   pnpm audit:path-identity -- --install # 再加 NSIS 真安装（需已有 setup.exe）
 *   pnpm audit:path-identity -- --build --install  # 先 tauri build 再装
 *
 * 环境：
 *   DSH_AUDIT_INSTALL=1  等同 --install
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = join(root, "src-tauri");
const args = process.argv.slice(2);
const wantBuild = args.includes("--build");
const wantInstall =
  args.includes("--install") || process.env.DSH_AUDIT_INSTALL === "1";

const report = {
  timestamp: new Date().toISOString(),
  platform: process.platform,
  phases: [],
  ok: true,
};

function phase(name, ok, detail, data) {
  report.phases.push({ name, ok, detail, data: data ?? null });
  if (!ok) report.ok = false;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}: ${detail}`);
}

function read(rel) {
  const p = join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function run(cmd, cmdArgs, opts = {}) {
  // shell:true 会拆开含空格路径（如 "DeepSeek Harness Desktop_…-setup.exe"）
  const useShell = opts.shell ?? false;
  const r = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? root,
    encoding: "utf8",
    shell: useShell,
    env: { ...process.env, ...opts.env },
    timeout: opts.timeout ?? 600_000,
  });
  return r;
}

/** cargo / pnpm 等需 shell 的命令 */
function runShell(cmd, cmdArgs, opts = {}) {
  return run(cmd, cmdArgs, { ...opts, shell: true });
}

// ── Phase 1: static config ─────────────────────────────────────────────

function staticChecks() {
  const confText = read("src-tauri/tauri.conf.json");
  if (!confText) {
    phase("static:tauri.conf", false, "missing tauri.conf.json");
    return;
  }
  const conf = JSON.parse(confText);
  const productName = conf.productName;
  const mainBinary = conf.mainBinaryName;
  const id = conf.identifier;
  const nsis = conf.bundle?.windows?.nsis ?? {};

  const okIdentity =
    productName === "DeepSeek Harness Desktop" &&
    mainBinary === "deepseek-harness-desktop" &&
    id === "com.deepseek.harness.desktop";
  phase(
    "static:identity",
    okIdentity,
    `productName=${productName} mainBinaryName=${mainBinary} identifier=${id}`,
  );

  const okNsis =
    nsis.startMenuFolder === "DeepSeek Harness" &&
    Array.isArray(nsis.languages) &&
    nsis.languages.includes("English") &&
    nsis.languages.includes("SimpChinese") &&
    String(nsis.installerHooks ?? "").includes("hooks.nsh");
  phase(
    "static:nsis-config",
    okNsis,
    `startMenuFolder=${nsis.startMenuFolder} languages=${JSON.stringify(nsis.languages)}`,
  );

  const hooks = read("src-tauri/installer/windows/hooks.nsh");
  if (!hooks) {
    phase("static:nsis-hooks", false, "missing hooks.nsh");
    return;
  }
  const okHooks =
    hooks.includes("DeepSeek Harness 桌面版.lnk") &&
    hooks.includes("SetLnkAppUserModelId") &&
    hooks.includes("NSIS_HOOK_PREINSTALL") &&
    hooks.includes("FindFirst") &&
    hooks.includes("Abort");
  phase("static:nsis-hooks-dual-shortcut", okHooks, "hooks.nsh conflict+AUMID+zh alias");
}

// ── Phase 2: Rust disk audit ───────────────────────────────────────────

function rustDiskAudit() {
  const test = runShell(
    "cargo",
    ["test", "--test", "path_identity_disk", "--", "--nocapture"],
    { cwd: tauriDir, timeout: 300_000 },
  );
  phase(
    "rust:integration-test",
    test.status === 0,
    test.status === 0 ? "path_identity_disk" : (test.stderr || test.stdout || "").slice(-400),
  );

  const bin = runShell("cargo", ["run", "--quiet", "--bin", "path_audit"], {
    cwd: tauriDir,
    timeout: 300_000,
  });
  let auditJson = null;
  try {
    const start = bin.stdout.indexOf("{");
    if (start >= 0) auditJson = JSON.parse(bin.stdout.slice(start));
  } catch {
    /* ignore */
  }
  phase(
    "rust:path_audit-binary",
    bin.status === 0 && auditJson?.ok === true,
    auditJson
      ? `${auditJson.cases?.length ?? 0} cases sandbox=${auditJson.sandbox}`
      : (bin.stderr || bin.stdout || "no output").slice(-400),
    auditJson,
  );
}

// ── Phase 3: NSIS install (Windows only) ───────────────────────────────

function findSetupExe() {
  const bases = [
    join(tauriDir, "target", "release", "bundle", "nsis"),
    join(tauriDir, "target", "debug", "bundle", "nsis"),
  ];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    const hit = readdirSync(base).find(
      (f) =>
        f.endsWith("-setup.exe") ||
        f.endsWith("_setup.exe") ||
        /setup\.exe$/i.test(f),
    );
    if (hit) return join(base, hit);
  }
  return null;
}

function ps(script) {
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", shell: false, timeout: 120_000 },
  );
  return { ok: r.status === 0, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

function readShortcutTarget(lnkPath) {
  const escaped = lnkPath.replace(/'/g, "''");
  const { ok, stdout } = ps(`
    $s = New-Object -ComObject WScript.Shell
    $l = $s.CreateShortcut('${escaped}')
    Write-Output $l.TargetPath
  `);
  return ok ? stdout : null;
}

function killRunningApp() {
  ps(
    "Get-Process -Name 'deepseek-harness-desktop' -ErrorAction SilentlyContinue | Stop-Process -Force",
  );
}

function nsisInstallAudit() {
  if (process.platform !== "win32") {
    phase("nsis:platform", false, "install audit requires Windows");
    return;
  }

  if (wantBuild) {
    console.log("… building NSIS bundle (may take several minutes)");
    const build = runShell("pnpm", ["tauri", "build", "--bundles", "nsis"], {
      timeout: 900_000,
    });
    const setupAfterBuild = findSetupExe();
    const buildOk = build.status === 0 || !!setupAfterBuild;
    phase(
      "nsis:build",
      buildOk,
      buildOk
        ? setupAfterBuild ?? "tauri build --bundles nsis"
        : (build.stderr || build.stdout || "").slice(-500),
    );
    if (!buildOk) return;
  }

  const setup = findSetupExe();
  if (!setup) {
    phase(
      "nsis:setup-exe",
      false,
      "no *-setup.exe under target/*/bundle/nsis — run with --build or pnpm tauri build",
    );
    return;
  }
  phase("nsis:setup-exe", true, setup);

  const installDir = join(tmpdir(), `dsh-audit-install-${process.pid}`);
  const startMenu = join(
    homedir(),
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "DeepSeek Harness",
  );

  killRunningApp();
  try {
    rmSync(installDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  // 3a. 冲突：非空 foreign 目录应中止（exit != 0）
  const conflictDir = join(tmpdir(), `dsh-audit-conflict-${process.pid}`);
  mkdirSync(conflictDir, { recursive: true });
  writeFileSync(join(conflictDir, "foreign.txt"), "x");
  const conflictRun = run(setup, ["/S", `/D=${conflictDir}`], { timeout: 180_000 });
  phase(
    "nsis:install-conflict-aborts",
    conflictRun.status !== 0,
    `exit=${conflictRun.status ?? "null"} (expect non-zero)`,
  );
  rmSync(conflictDir, { recursive: true, force: true });

  // 3b. 正常静默安装
  const installRun = run(setup, ["/S", `/D=${installDir}`], { timeout: 300_000 });
  const exePath = join(installDir, "deepseek-harness-desktop.exe");
  const exeOk = installRun.status === 0 && existsSync(exePath);
  phase(
    "nsis:silent-install",
    exeOk,
    exeOk ? exePath : `exit=${installRun.status} stderr=${(installRun.stderr || "").slice(-200)}`,
  );
  if (!exeOk) return;

  // 3b2. 空目录安装（应成功）
  const emptyDir = join(tmpdir(), `dsh-audit-empty-${process.pid}`);
  try {
    rmSync(emptyDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(emptyDir, { recursive: true });
  const emptyRun = run(setup, ["/S", `/D=${emptyDir}`], { timeout: 300_000 });
  const emptyExe = join(emptyDir, "deepseek-harness-desktop.exe");
  phase(
    "nsis:install-empty-dir",
    emptyRun.status === 0 && existsSync(emptyExe),
    `exit=${emptyRun.status} dir=${emptyDir}`,
  );
  if (existsSync(join(emptyDir, "uninstall.exe"))) {
    killRunningApp();
    run(join(emptyDir, "uninstall.exe"), ["/S", `_?=${emptyDir}`], { timeout: 180_000 });
  }
  try {
    rmSync(emptyDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  // 3b3. 覆盖安装（同目录已有本 exe，应成功升级）
  const reinstallRun = run(setup, ["/S", `/D=${installDir}`], { timeout: 300_000 });
  phase(
    "nsis:reinstall-same-dir",
    reinstallRun.status === 0 && existsSync(exePath),
    `exit=${reinstallRun.status}`,
  );

  // 3c. 双快捷方式：Tauri PRODUCTNAME (Desktop) + hook 桌面版；同目录指向本 exe 的 lnk ≤ 2
  const lnkDesktop = join(startMenu, "DeepSeek Harness Desktop.lnk");
  const lnkZh = join(startMenu, "DeepSeek Harness 桌面版.lnk");
  const desktopExists = existsSync(lnkDesktop);
  const zhExists = existsSync(lnkZh);
  const targetDesktop = desktopExists ? readShortcutTarget(lnkDesktop) : null;
  const targetZh = zhExists ? readShortcutTarget(lnkZh) : null;
  const targetsMatch =
    targetDesktop?.toLowerCase() === exePath.toLowerCase() &&
    targetZh?.toLowerCase() === exePath.toLowerCase();

  let lnkCountToExe = 0;
  if (existsSync(startMenu)) {
    for (const name of readdirSync(startMenu)) {
      if (!name.toLowerCase().endsWith(".lnk")) continue;
      const t = readShortcutTarget(join(startMenu, name));
      if (t?.toLowerCase() === exePath.toLowerCase()) lnkCountToExe += 1;
    }
  }

  phase(
    "nsis:startmenu-desktop-lnk",
    desktopExists && targetsMatch,
    desktopExists ? `${lnkDesktop} -> ${targetDesktop}` : "missing PRODUCTNAME lnk",
  );
  phase(
    "nsis:startmenu-zh-lnk",
    zhExists && targetsMatch,
    zhExists ? `${lnkZh} -> ${targetZh}` : "missing",
  );
  phase(
    "nsis:startmenu-lnk-count",
    lnkCountToExe >= 2 && lnkCountToExe <= 2,
    `lnk targeting exe in folder: ${lnkCountToExe} (expect 2)`,
  );

  // 3d. 卸载
  const uninstaller = join(installDir, "uninstall.exe");
  if (existsSync(uninstaller)) {
    killRunningApp();
    const un = run(uninstaller, ["/S", `_?=${installDir}`], { timeout: 180_000 });
    phase(
      "nsis:silent-uninstall",
      un.status === 0 && !existsSync(exePath),
      `exit=${un.status} exeGone=${!existsSync(exePath)}`,
    );
  } else {
    phase("nsis:uninstaller", false, "uninstall.exe missing");
  }

  // cleanup shortcuts if uninstall missed
  for (const lnk of [lnkDesktop, lnkZh]) {
    try {
      if (existsSync(lnk)) rmSync(lnk);
    } catch {
      /* ignore */
    }
  }
  try {
    rmSync(installDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// ── main ───────────────────────────────────────────────────────────────

console.log("audit:path-identity — B50 disk + optional NSIS\n");

staticChecks();
rustDiskAudit();

if (wantInstall) {
  nsisInstallAudit();
} else {
  phase(
    "nsis:skipped",
    true,
    "pass --install or DSH_AUDIT_INSTALL=1 to run NSIS silent install audit",
  );
}

console.log("\n--- JSON report ---");
console.log(JSON.stringify(report, null, 2));

process.exit(report.ok ? 0 : 1);
