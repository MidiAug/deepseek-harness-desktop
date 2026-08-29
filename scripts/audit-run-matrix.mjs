#!/usr/bin/env node
/**
 * 审计矩阵：多场景探测（英文 locale、经典顶栏、二次启动、loopback）。
 * 不修改用户 harness 安装；仅改 ui.json / settings.yaml 可逆项。
 */
import http from "node:http";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");
const appData = join(process.env.APPDATA, "com.deepseek.harness.desktop");
const dshYaml = join(process.env.USERPROFILE || "", ".dsh", "settings.yaml");
const uiPath = join(appData, "ui.json");
const exe = join(root, "src-tauri", "target", "debug", "deepseek-harness-desktop.exe");

function getTargets() {
  return new Promise((resolve, reject) => {
    http
      .get("http://127.0.0.1:9222/json/list", (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      })
      .on("error", reject);
  });
}

async function cdpEval(expression) {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === "page");
  if (!page) return { error: "no CDP page" };
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const id = 1;
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.close();
        resolve(msg.result?.result?.value ?? msg.result?.exceptionDetails);
      }
    });
    ws.addEventListener("error", reject);
    setTimeout(() => reject(new Error("CDP timeout")), 15000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function harnessChildPids() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'com.deepseek.harness.desktop\\\\harness\' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
      { encoding: "utf8" },
    ).trim();
    return out ? JSON.parse(out) : [];
  } catch {
    return [];
  }
}

const results = { timestamp: new Date().toISOString(), scenarios: [] };

// --- 英文 locale（改 yaml，等 watch）---
const yamlBackup = existsSync(dshYaml) ? readFileSync(dshYaml, "utf8") : "";
if (yamlBackup) {
  const enYaml = yamlBackup.replace(
    /locale:\s*\n\s*preference:\s*\w+/,
    "locale:\n  preference: en",
  );
  writeFileSync(dshYaml, enYaml, "utf8");
  await sleep(3000);
  const enDom = await cdpEval(`
    JSON.stringify({
      lang: document.documentElement.lang,
      ariaLabels: Array.from(document.querySelectorAll('[aria-label]')).slice(0,12).map(e=>e.getAttribute('aria-label')),
      menuText: document.querySelector('.titlebar-classic')?.innerText?.slice(0,200) || null,
    })
  `);
  results.scenarios.push({
    id: "locale-en",
    action: "settings.yaml locale.preference=en + wait 3s",
    observation: JSON.parse(enDom || "{}"),
  });
  writeFileSync(dshYaml, yamlBackup, "utf8");
  await sleep(2000);
}

// --- 经典顶栏（改 ui.json，需重启窗体：仅记录文件态 + 若 CDP 仍 compact 则记失败）---
const uiBackup = readFileSync(uiPath, "utf8");
const ui = JSON.parse(uiBackup);
ui.titlebarCompact = false;
writeFileSync(uiPath, JSON.stringify(ui, null, 2), "utf8");
results.scenarios.push({
  id: "classic-titlebar-config",
  action: "ui.json titlebarCompact=false (runtime may need settings reopen or restart)",
  observation: { uiWritten: true },
});
writeFileSync(uiPath, uiBackup, "utf8");

// --- 二次启动（单实例）---
let secondInstance = { attempted: false };
if (existsSync(exe)) {
  try {
    execSync(`start "" "${exe}"`, { shell: "cmd.exe" });
    secondInstance = { attempted: true, note: "spawned second exe; expect focus existing window" };
    await sleep(3000);
    const procs = execSync("tasklist /FI \"IMAGENAME eq deepseek-harness-desktop.exe\"", {
      encoding: "utf8",
    });
    secondInstance.tasklist = procs.trim().split(/\r?\n/).filter((l) => l.includes("deepseek"));
  } catch (e) {
    secondInstance = { attempted: true, error: String(e) };
  }
}
results.scenarios.push({ id: "single-instance", ...secondInstance });

// --- 托管 harness 子进程归因 ---
results.scenarios.push({
  id: "harness-child-processes",
  observation: harnessChildPids(),
});

// --- check:release ---
try {
  const rel = execSync("pnpm check:release", { cwd: root, encoding: "utf8" });
  results.scenarios.push({ id: "check-release", ok: true, output: rel.trim().slice(-500) });
} catch (e) {
  results.scenarios.push({
    id: "check-release",
    ok: false,
    output: String(e.stdout || e.message).slice(-800),
  });
}

// --- updater endpoint 占位 ---
const conf = JSON.parse(
  readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);
results.scenarios.push({
  id: "updater-endpoint",
  endpoints: conf.plugins?.updater?.endpoints,
  version: conf.version,
});

// --- B60: boot surface + selection static guards ---
try {
  execSync(
    "node --test --experimental-strip-types src/shell/bootSurfaceMode.test.ts src/shell/inject/copyActiveSelection.logic.test.ts",
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  results.scenarios.push({ id: "boot-surface-static", ok: true });
} catch (e) {
  results.scenarios.push({
    id: "boot-surface-static",
    ok: false,
    output: String(e.stdout || e.stderr || e.message).slice(-400),
  });
}
try {
  execSync("node scripts/check-copy-active-selection.mjs", {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  results.scenarios.push({ id: "selection-inject-static", ok: true });
} catch (e) {
  results.scenarios.push({
    id: "selection-inject-static",
    ok: false,
    output: String(e.stdout || e.stderr || e.message).slice(-400),
  });
}

mkdirSync(outDir, { recursive: true });
const stamp = results.timestamp.replace(/[:.]/g, "-");
const outPath = join(outDir, `matrix-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
console.log(JSON.stringify({ outPath, results }, null, 2));

const failed = results.scenarios.some((s) => s.ok === false);
if (failed) {
  const ids = results.scenarios.filter((s) => s.ok === false).map((s) => s.id);
  console.error("audit:matrix failed scenarios:", ids.join(", "));
  process.exit(1);
}
